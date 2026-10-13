import { expect, test, type BrowserContext, type Page } from "playwright/test";
import { authorityRead } from "./fixtures/guest-study-browser/api.ts";
import { proof, proofCookie } from "./fixtures/guest-study-browser/data.ts";
import { installOwnerApi } from "./fixtures/guest-study-browser/owner-api.ts";
import { originalCreditId } from "./fixtures/guest-study-browser/owner-data.ts";
const origin = process.env.GUEST_STUDY_BROWSER_ORIGIN;
if (origin === undefined) throw new Error("Owned HTTPS browser runner required");
const base = origin;
async function boundary(context: BrowserContext, options: Parameters<typeof installOwnerApi>[2], work: (api: Awaited<ReturnType<typeof installOwnerApi>>) => Promise<void>) {
  const api = await installOwnerApi(context, base, options), errors: unknown[] = [];
  const record = (error: Error) => errors.push(error), attach = (page: Page) => page.on("pageerror", record);
  context.pages().forEach(attach); context.on("page", attach);
  let failed = false, primary: unknown; const cleanup: unknown[] = [];
  try { await work(api); } catch (error) { failed = true; primary = error; }
  finally {
    try { await api.dispose(); } catch (error) { cleanup.push(error); }
    context.off("page", attach); context.pages().forEach(page => page.off("pageerror", record)); cleanup.push(...errors);
  }
  if (cleanup.length > 0) throw new AggregateError(failed ? [primary, ...cleanup] : cleanup, "Owned Account browser boundary failed");
  if (failed) throw primary;
}
function records(value: unknown): readonly unknown[] {
  if (typeof value !== "object" || value === null || !("ownerStarts" in value) || !Array.isArray(value.ownerStarts)) throw new Error("Native original Account journal missing");
  return value.ownerStarts;
}
async function enter(page: Page) {
  expect((await page.goto(base, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
  await expect(page.locator("[data-owner-study-consent]")).toBeVisible();
  expect(await page.evaluate(() => ({ secure: isSecureContext, indexedDB: typeof indexedDB !== "undefined", locks: typeof navigator.locks !== "undefined" })))
    .toEqual({ secure: true, indexedDB: true, locks: true });
}
async function consent(page: Page, account = "account-A") {
  const entry = page.locator("[data-owner-study-consent]");
  await expect(entry.getByRole("button", { name: "Review actual chance terms", exact: true })).toBeDisabled();
  await expect(entry.getByRole("button", { name: "Start with accepted original terms", exact: true })).toBeDisabled();
  await entry.getByRole("button", { name: `Use ${account} for this entry`, exact: true }).click();
  await entry.getByRole("combobox", { name: "Helper language for rewarded Study", exact: true }).selectOption("ar");
  await entry.getByRole("combobox", { name: "Learner level for rewarded Study", exact: true }).selectOption("A1");
  await entry.getByRole("button", { name: "Review actual chance terms", exact: true }).click();
  await expect(entry.locator("[data-owner-study-disclosure]")).toContainText("actual recording disclosure");
  await expect(entry.getByRole("button", { name: "Start with accepted original terms", exact: true })).toBeDisabled();
  await entry.locator("[data-owner-study-disclosure]").getByRole("checkbox").check();
}
async function begin(page: Page) {
  await page.getByRole("button", { name: "Start with accepted original terms", exact: true }).click();
  await expect(page.getByRole("button", { name: "Answer one", exact: true })).toBeEnabled();
}
async function resume(page: Page) {
  await enter(page); await page.getByRole("button", { name: "Resume original entry", exact: true }).click();
  await expect(page.getByRole("button", { name: "Answer one", exact: true })).toBeEnabled();
}

test.describe("Account original Study and rewards (native browser; API boundary scripted)", () => {
  test("explicit persona/terms and two actual tabs retain one durable original start across reload", async ({ context, page }) => {
    await boundary(context, { holdStart: true }, async api => {
      const second = await context.newPage();
      try {
        await Promise.all([enter(page), enter(second)]); expect(api.counts.start).toBe(0);
        await Promise.all([consent(page), consent(second)]); expect(api.counts.start).toBe(0);
        await page.getByRole("button", { name: "Start with accepted original terms", exact: true }).click(); await api.startEntered.promise;
        await second.getByRole("button", { name: "Start with accepted original terms", exact: true }).click();
        await expect.poll(() => second.evaluate(async () => { const state = await navigator.locks.query(); return {
          held: (state.held ?? []).filter(lock => lock.name === "pirate.guest-authority.v1").length,
          pending: (state.pending ?? []).filter(lock => lock.name === "pirate.guest-authority.v1").length }; })).toEqual({ held: 1, pending: 1 });
        expect(api.counts.start).toBe(1);
        const submitted = await authorityRead(second, base); expect(submitted).toMatchObject({ ownerStarts: [{ state: "submitted", inventory: null }] });
        expect(JSON.stringify(submitted)).not.toContain(proof);
        api.releaseStart.resolve();
        await expect(page.getByRole("button", { name: "Answer one", exact: true })).toBeEnabled();
        await expect(second.getByRole("button", { name: "Answer one", exact: true })).toBeEnabled();
        const before = await authorityRead(page, base); expect(before).toMatchObject({ ownerStarts: [{ state: "completed", inventory: { initialized: true, pending: null } }] });
        await page.reload({ waitUntil: "domcontentloaded" }); await resume(page);
        expect(await authorityRead(page, base)).toEqual(before);
        expect(api.counts.start).toBe(1); expect(api.originalBodies).toHaveLength(1); expect(api.counts.guestOperations).toBe(0);
      } finally { api.releaseStart.resolve(); await second.close(); }
    });
  });
  test("unknown original start remains durable and isolated after actual Account-switch reload", async ({ context, page }) => {
    await boundary(context, { unknownStart: true }, async api => {
      await enter(page); await consent(page);
      await page.getByRole("button", { name: "Start with accepted original terms", exact: true }).click();
      await expect(page.getByText("Recover the original request before starting another lesson", { exact: false })).toBeVisible();
      const before = await authorityRead(page, base); expect(before).toMatchObject({ ownerStarts: [{ accountId: "account-A", state: "pending_confirmation", inventory: null }] });
      const lookups = api.counts.lookup;
      await api.switchAccount("account-B"); await page.reload({ waitUntil: "domcontentloaded" }); await enter(page);
      const entry = page.locator("[data-owner-study-consent]");
      await expect(entry.getByRole("button", { name: "Use account-B for this entry", exact: true })).toBeVisible();
      await expect(entry.getByRole("button", { name: "Start with accepted original terms", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "Resume original entry", exact: true }).click();
      await expect(page.getByText("Recover the original request before starting another lesson", { exact: false })).toBeVisible();
      expect(api.counts.lookup).toBe(lookups); expect(await authorityRead(page, base)).toEqual(before);
      await consent(page, "account-B"); await begin(page);
      const after = await authorityRead(page, base); expect(records(after)[0]).toEqual(records(before)[0]);
      expect(after).toMatchObject({ ownerStarts: [expect.objectContaining({ accountId: "account-A", state: "pending_confirmation" }), expect.objectContaining({ accountId: "account-B", state: "completed" })] });
      expect(api.counts.start).toBe(2); expect(api.originalBodies).toHaveLength(2); expect(api.counts.guestOperations).toBe(0);
      // The later scripted original receipt is read under its restored exact Account;
      // unknown POST recovery never initializes fresh grading metadata.
      await api.switchAccount("account-A"); await page.reload({ waitUntil: "domcontentloaded" }); await enter(page);
      await page.getByRole("button", { name: "Resume original entry", exact: true }).click();
      await expect(page.locator("[data-owner-study-read-only-recovery]")).toBeVisible();
      await expect(page.getByRole("button", { name: "Answer one", exact: true })).toHaveCount(0);
      expect(await authorityRead(page, base)).toMatchObject({ ownerStarts: [expect.objectContaining({ accountId: "account-A", state: "completed", inventory: null }), expect.objectContaining({ accountId: "account-B", state: "completed" })] });
      expect(api.counts.start).toBe(2);
    });
  });
  test("original recipient/unknown claim survives reload, follows actual Very return link and never forwards Guest proof", async ({ context, page }) => {
    await boundary(context, { claimRecovery: true }, async api => {
      await enter(page); await consent(page); await begin(page);
      await page.getByRole("button", { name: "Read Account rewards", exact: true }).click();
      await expect(page.getByText("Held and owed; not claimed", { exact: false })).toBeVisible();
      await page.getByRole("button", { name: "Use account-A as payout recipient", exact: true }).click();
      await page.getByRole("button", { name: "Select or retry original recipient", exact: true }).click();
      await expect.poll(() => api.counts.selection).toBe(1);
      await page.getByRole("button", { name: "Claim or retry original credit", exact: true }).click();
      await expect(page.getByText("Original selection or claim is unresolved", { exact: false })).toBeVisible();
      expect(api.counts.claim).toBe(1);
      const pending = await authorityRead(page, base); expect(pending).toMatchObject({ ownerCreditCommands: expect.arrayContaining([expect.objectContaining({ creditId: originalCreditId, kind: "owner_claim", state: "submitted" })]) });
      await page.reload({ waitUntil: "domcontentloaded" }); await resume(page);
      await page.getByRole("button", { name: "Read Account rewards", exact: true }).click();
      await expect(page.getByText("Held and owed; not claimed", { exact: false })).toBeVisible();
      await page.getByRole("button", { name: "Refresh original participation", exact: true }).click();
      await page.getByRole("button", { name: "Claim or retry original credit", exact: true }).click();
      await expect(page).toHaveURL(url => url.pathname === "/verify/very" && url.searchParams.get("purpose") === "reward_claim");
      expect(api.claimBodies[1]).toEqual(api.claimBodies[0]);
      const returnTo = new URL(page.url()).searchParams.get("return_to");
      if (returnTo === null || !returnTo.startsWith("/") || returnTo.startsWith("//")) throw new Error("Original current-host claim return required");
      expect(new URL(returnTo, base).searchParams.get("owner_credit")).toBe(originalCreditId);
      // Script the later API result only. No real Very device/provider proof or native payment acceptance is claimed.
      api.acceptScriptedVerification(); await page.goto(new URL(returnTo, base).href, { waitUntil: "domcontentloaded" }); await resume(page);
      await page.getByRole("button", { name: "Read Account rewards", exact: true }).click();
      await expect(page.getByText("Held and owed; not claimed", { exact: false })).toBeVisible();
      await page.getByRole("button", { name: "Claim or retry original credit", exact: true }).click();
      await expect(page.getByText("Sent to your wallet", { exact: false })).toBeVisible(); expect(api.counts.claim).toBe(3);
      expect(api.selectionBodies).toHaveLength(1); expect(api.counts.start).toBe(1); expect(api.counts.guestOperations).toBe(0);
      expect(JSON.stringify(await authorityRead(page, base))).not.toContain(proof);
      expect((await context.cookies(api.namedOrigin)).some(cookie => cookie.name === proofCookie)).toBe(false);
      const named = await context.newPage();
      try { await named.goto(api.namedOrigin, { waitUntil: "domcontentloaded" }); await expect.poll(() => api.counts.named).toBeGreaterThan(0); }
      finally { await named.close(); }
      expect(api.counts.participationDetail).toBe(1);
    });
  });
});
