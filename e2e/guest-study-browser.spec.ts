import { expect, test, type BrowserContext, type Page } from "playwright/test";
import { answerRead, authorityRead, installApi } from "./fixtures/guest-study-browser/api.ts";
import { csrf, ownerId, proof, proofCookie } from "./fixtures/guest-study-browser/data.ts";

const origin = process.env.GUEST_STUDY_BROWSER_ORIGIN;
if (origin === undefined) throw new Error("Owned HTTPS browser runner required");
const base = origin;
async function boundary(context: BrowserContext, options: Parameters<typeof installApi>[2],
  work: (api: Awaited<ReturnType<typeof installApi>>) => Promise<void>) {
  const api = await installApi(context, base, options);
  const pageErrors: unknown[] = [];
  const record = (error: Error) => pageErrors.push(error);
  const attach = (page: Page) => page.on("pageerror", record);
  context.pages().forEach(attach); context.on("page", attach);
  let failed = false, primary: unknown;
  const cleanup: unknown[] = [];
  try { await work(api); }
  catch (error) { failed = true; primary = error; }
  finally {
    try { await api.dispose(); } catch (error) { cleanup.push(error); }
    context.off("page", attach);
    context.pages().forEach((page) => page.off("pageerror", record));
    cleanup.push(...pageErrors);
  }
  if (cleanup.length > 0) throw new AggregateError(failed ? [primary, ...cleanup] : cleanup, "Owned browser/API fixture failed");
  if (failed) throw primary;
}
async function enter(page: Page) {
  const response = await page.goto(base, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator("[data-guest-study-entry]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Study without signing in", exact: true })).toBeVisible();
  await expect(page.locator("[data-guest-study-disclosure]")).toContainText("actual recording disclosure");
  expect(await page.evaluate(() => ({ secure: isSecureContext, indexedDB: typeof indexedDB !== "undefined", locks: typeof navigator.locks !== "undefined",
    protocol: location.protocol }))).toEqual({ secure: true, indexedDB: true, locks: true, protocol: "https:" });
}
async function configure(page: Page) {
  await page.getByRole("checkbox").check();
  await page.getByRole("combobox", { name: "Translation language", exact: true }).selectOption("ar");
  await page.getByRole("combobox", { name: "Learner level", exact: true }).selectOption("A1");
}
async function start(page: Page) {
  await configure(page);
  await page.getByRole("button", { name: "Start practice", exact: true }).click();
  await expect(page.getByRole("button", { name: "Answer one", exact: true })).toBeEnabled();
}
async function resume(page: Page) {
  await enter(page);
  await page.getByRole("button", { name: "Resume previous lesson", exact: true }).click();
}

test.describe("Guest Study native browser protocol (API boundary scripted)", () => {
  for (const account of ["pending", "failed"] as const) test(`public Study is actionable while ordinary account is ${account}`, async ({ context, page }) => {
    const finished: string[] = [];
    page.on("requestfinished", (request) => { if (new URL(request.url()).pathname === "/api/users/me") finished.push("finished"); });
    page.on("requestfailed", (request) => { if (new URL(request.url()).pathname === "/api/users/me") finished.push("failed"); });
    await boundary(context, { account }, async (api) => {
      await enter(page); await configure(page);
      await expect(page.getByRole("button", { name: "Start practice", exact: true })).toBeEnabled();
      await expect.poll(() => api.counts.account).toBeGreaterThan(0);
      if (account === "pending") expect(finished).toEqual([]);
      else await expect.poll(() => finished.length).toBeGreaterThan(0);
      expect(api.counts.prepared).toBeGreaterThan(0);
      expect(api.counts.issue).toBe(0); expect(api.counts.start).toBe(0);
      await expect(page.getByText("Sign in to start", { exact: false })).toHaveCount(0);
    });
  });

  test("two real tabs serialize one original start with native pointer/body commits before POST", async ({ context, page }) => {
    await boundary(context, { account: "failed", holdStart: true }, async (api) => {
      const second = await context.newPage();
      try {
        await Promise.all([enter(page), enter(second)]);
        await Promise.all([configure(page), configure(second)]);
        await page.getByRole("button", { name: "Start practice", exact: true }).click();
        await api.startEntered.promise;
        await second.getByRole("button", { name: "Start practice", exact: true }).click();
        await expect.poll(() => second.evaluate(async () => {
          const state = await navigator.locks.query();
          return { held: (state.held ?? []).filter((lock) => lock.name === "pirate.guest-authority.v1").length,
            pending: (state.pending ?? []).filter((lock) => lock.name === "pirate.guest-authority.v1").length };
        })).toEqual({ held: 1, pending: 1 });
        expect(api.counts.start).toBe(1);
        const saved = await authorityRead(second, base);
        expect(saved).toMatchObject({ pointer: { owner_id: ownerId, credential_id: "200" }, starts: [{ state: "submitted" }] });
        expect(JSON.stringify(saved)).not.toContain(proof);
        api.releaseStart.resolve();
        await expect(page.getByRole("button", { name: "Answer one", exact: true })).toBeEnabled();
        await expect.poll(() => api.counts.lookup).toBe(1);
        expect(api.counts.issue).toBe(1); expect(api.counts.confirm).toBe(1); expect(api.counts.start).toBe(1);
        expect(api.originalRequests).toHaveLength(1);
        const final = await authorityRead(page, base);
        expect(final).toMatchObject({ starts: [{ state: "completed" }] });
      } finally { api.releaseStart.resolve(); await second.close(); }
    });
  });

  test("an unknown original answer survives actual reload and forbids a new POST or payload", async ({ context, page }) => {
    await boundary(context, { account: "failed", answer: "unknown" }, async (api) => {
      await enter(page); await start(page);
      await page.getByRole("button", { name: "Answer one", exact: true }).click();
      await api.answerEntered.promise;
      await expect(page.locator("[data-guest-answer-pending]")).toBeVisible();
      const before = await answerRead(page, base);
      expect(before).toMatchObject({ pending: { idempotencyKey: api.answerKeys[0], sessionItemId: "item-1", attemptNumber: 1 } });
      await page.reload({ waitUntil: "domcontentloaded" }); await resume(page);
      await expect(page.locator("[data-guest-study-read-only-recovery]")).toBeVisible();
      await expect(page.getByRole("button", { name: "Answer one", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Record", exact: true })).toHaveCount(0);
      expect(await answerRead(page, base)).toEqual(before);
      expect(api.counts.answer).toBe(1); expect(api.counts.start).toBe(1);
      expect(api.answerKeys).toHaveLength(1);
    });
  });

  test("known-clean native inventory survives reload, permits one JSON answer, and keeps proof host-only", async ({ context, page }) => {
    await boundary(context, { account: "failed", answer: "accepted" }, async (api) => {
      await enter(page); await start(page);
      expect(await answerRead(page, base)).toMatchObject({ pending: null });
      const cookies = await context.cookies(base);
      const guestProof = cookies.find((cookie) => cookie.name === proofCookie);
      expect(guestProof).toMatchObject({ domain: "127.0.0.1", path: "/", secure: true, httpOnly: true, sameSite: "Lax" });
      expect(await page.evaluate(() => document.cookie)).toContain(`__Host-pirate_guest_csrf=${csrf}`);
      expect(await page.evaluate(() => document.cookie)).not.toContain(proofCookie);
      expect((await context.cookies(api.namedOrigin)).some((cookie) => cookie.name === proofCookie)).toBe(false);
      await page.reload({ waitUntil: "domcontentloaded" }); await resume(page);
      await expect(page.getByRole("button", { name: "Answer one", exact: true })).toBeEnabled();
      await expect(page.locator("[data-guest-study-read-only-recovery]")).toHaveCount(0);
      await page.getByRole("button", { name: "Answer one", exact: true }).click(); await api.answerEntered.promise;
      await expect.poll(async () => answerRead(page, base)).toMatchObject({ pending: null });
      expect(api.counts.answer).toBe(1); expect(api.counts.start).toBe(1);
      expect(JSON.stringify(await authorityRead(page, base))).not.toContain(proof);
      expect(JSON.stringify(await answerRead(page, base))).not.toContain("Answer one");
      const named = await context.newPage();
      try {
        await named.goto(api.namedOrigin, { waitUntil: "domcontentloaded" });
        await named.evaluate(async () => { const response = await fetch("/api/guest/authority", { credentials: "same-origin" });
          if (!response.ok) throw new Error("Named origin fixture unavailable"); });
        expect(api.counts.namedProof).toBe(1);
      } finally { await named.close(); }
    });
  });
});
