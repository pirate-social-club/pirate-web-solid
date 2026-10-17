import { expect, test, type BrowserContext, type Page } from "playwright/test";
import type { PostCommunitiesCommunityIdHnsRootImportsResponse } from "@pirate/api-client";

const origin = "http://127.0.0.1:4197";
const txid = "b".repeat(64);
const receiptKey = "pirate:hns-publication:v1:community-fixture:session-fixture";
const records = [{ type: "TXT", txt: ["pirate-verification=session-fixture"] }];
const initial: Extract<PostCommunitiesCommunityIdHnsRootImportsResponse, { status: "awaiting_owner_update" | "observing" }> = {
  community_id: "community-fixture", root_import_session_id: "session-fixture",
  root_label: "midnight", publish_plan_sha256: "a".repeat(64),
  attachment_intent_id: "attachment-fixture", expires_at: "2099-09-11T00:00:00.000Z",
  replayed: false, revision: 3, status: "awaiting_owner_update", publication_check_pending: false,
  publish_plan: {
    version: "pirate-hns-root-import-publish-plan-v1", replacement_semantics: "complete_resource",
    acknowledgement_required: true, current_records: [], added_records: records,
    preserved_records: [], preserved_unknown_record_types: [], removed_conflicts: [], replacement_records: records,
  },
  readiness_result_sha256: null, retry_after_seconds: 30,
};

async function fixture(context: BrowserContext, options: {
  connect?: () => Promise<void>;
  send?: () => Promise<unknown>;
  loseAck?: boolean;
  acceptLostAck?: boolean;
} = {}) {
  let session = { ...initial };
  const calls = { connects: 0, sends: [] as unknown[][], acknowledgements: 0 };
  const unexpected: string[] = [];
  await context.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin !== origin) { unexpected.push(request.url()); await route.abort(); return; }
    if (!url.pathname.startsWith("/api/")) { await route.continue(); return; }
    const root = "/api/communities/community-fixture/hns-root-imports";
    if (request.method() === "GET" && [root, `${root}/session-fixture`].includes(url.pathname)) {
      await route.fulfill({ json: url.pathname === root ? { community_id: initial.community_id, attachment: null, session } : session }); return;
    }
    if (request.method() === "POST" && url.pathname === `${root}/session-fixture/poll`) {
      calls.acknowledgements++;
      expect(request.headers()["x-csrf-token"]).toBe("fixture-csrf");
      if (options.loseAck && calls.acknowledgements === 1) {
        if (options.acceptLostAck) session = { ...session, revision: 4, publication_check_pending: true };
        await route.abort("connectionreset"); return;
      }
      session = { ...session, revision: 4, publication_check_pending: true };
      await route.fulfill({ json: session }); return;
    }
    unexpected.push(`${request.method()} ${url.pathname}`); await route.abort();
  });
  await context.exposeBinding("hnsFixtureBob", async (_source, method: string, ...args: unknown[]) => {
    if (method === "connect") { calls.connects++; await options.connect?.(); return; }
    if (method !== "sendUpdate") throw new Error("unexpected wallet method");
    calls.sends.push(args);
    return options.send ? options.send() : { hash: txid };
  });
  await context.addInitScript(() => {
    // SAFETY: Only this suite injects the Playwright binding and fake provider.
    const scope = window as typeof window & { hnsFixtureBob: (method: string, ...args: unknown[]) => Promise<unknown> };
    Object.defineProperty(window, "bob3", { value: {
      connect: async () => {
        await scope.hnsFixtureBob("connect");
        return { sendUpdate: (root: string, resource: unknown) => scope.hnsFixtureBob("sendUpdate", root, resource) };
      },
    } });
  });
  return { calls, unexpected };
}

const bob = (page: Page) => page.getByRole("button", { name: "Publish to midnight/ with Bob Wallet", exact: true });
const check = (page: Page) => page.getByRole("button", { name: "Check publication status", exact: true });
const manual = (page: Page) => page.getByRole("button", { name: "I published all records manually", exact: true });
const receipt = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "null"), receiptKey);

for (const acceptLostAck of [false, true]) {
  test(`lost acknowledgement survives reload; server accepted = ${acceptLostAck}`, async ({ context, page }) => {
    const f = await fixture(context, { loseAck: true, acceptLostAck });
    await page.goto("/__hns-wallet"); await bob(page).click();
    await expect(page.getByText("could not be completed", { exact: false })).toBeVisible();
    expect(await receipt(page)).toMatchObject({ txid, publish_plan_sha256: initial.publish_plan_sha256 });
    const screenshot = test.info().outputPath("publication-recovery.png");
    await page.screenshot({ path: screenshot });
    await test.info().attach("publication-recovery", { path: screenshot, contentType: "image/png" });
    await page.reload(); await expect(bob(page)).toHaveCount(0);
    if (acceptLostAck) await expect(page.getByText("Checking published records", { exact: true })).toBeVisible();
    else { await check(page).click(); await expect.poll(() => f.calls.acknowledgements).toBe(2); }
    expect(f.calls.acknowledgements).toBe(acceptLostAck ? 1 : 2);
    expect(f.calls.sends).toEqual([["midnight", records]]); expect(f.unexpected).toEqual([]);
  });
}

test("two tabs waiting on native Web Locks send only once", async ({ context, page }) => {
  let finish!: () => void;
  const connected = new Promise<void>(resolve => { finish = resolve; });
  const f = await fixture(context, { connect: () => connected, loseAck: true });
  const second = await context.newPage();
  await page.goto("/__hns-wallet"); await second.goto("/__hns-wallet");
  await bob(page).click(); await expect.poll(() => f.calls.connects).toBe(1);
  expect(await receipt(page)).toBeNull();
  await bob(second).click();
  await expect.poll(() => second.evaluate(async () => (await navigator.locks.query()).pending?.length)).toBe(1);
  expect(f.calls.connects).toBe(1); finish();
  await expect(page.getByText("could not be completed", { exact: false })).toBeVisible();
  await expect(check(second)).toBeEnabled();
  await second.reload(); await check(second).click();
  await expect.poll(() => f.calls.acknowledgements).toBe(2);
  expect(f.calls.connects).toBe(1); expect(f.calls.sends).toEqual([["midnight", records]]);
  expect(f.unexpected).toEqual([]);
});

test("reload while sendUpdate is pending preserves an ambiguous intent", async ({ context, page }) => {
  const f = await fixture(context, { send: () => new Promise(() => {}) });
  await page.goto("/__hns-wallet"); await bob(page).click();
  await expect.poll(() => f.calls.sends.length).toBe(1);
  expect(await receipt(page)).toMatchObject({ txid: null });
  await page.reload(); await expect(bob(page)).toHaveCount(0);
  await check(page).click(); await expect.poll(() => f.calls.acknowledgements).toBe(1);
  expect(f.calls.sends).toHaveLength(1); expect(f.unexpected).toEqual([]);
});

test("ambiguous completion stays fenced after reload", async ({ context, page }) => {
  const f = await fixture(context, { send: async () => { throw new Error("response lost"); } });
  await page.goto("/__hns-wallet"); await bob(page).click();
  await expect(page.getByText("Bob's completion could not be confirmed", { exact: false })).toBeVisible();
  await page.reload(); await expect(bob(page)).toHaveCount(0);
  await check(page).click(); await expect.poll(() => f.calls.acknowledgements).toBe(1);
  expect(f.calls.sends).toHaveLength(1); expect(f.unexpected).toEqual([]);
});

test("a dismissed connection retries without a stored intent", async ({ context, page }) => {
  let first = true;
  const f = await fixture(context, { connect: async () => { if (first) { first = false; throw new Error("dismissed"); } } });
  await page.goto("/__hns-wallet"); await bob(page).click();
  await expect(page.getByText("Could not connect to Bob", { exact: false })).toBeVisible();
  expect(await receipt(page)).toBeNull(); expect(f.calls.sends).toHaveLength(0);
  await bob(page).click(); await expect.poll(() => f.calls.acknowledgements).toBe(1);
  expect(f.calls.sends).toHaveLength(1); expect(f.unexpected).toEqual([]);
});

for (const failure of ["storage", "locks"]) {
  test(`manual acknowledgement works without ${failure}`, async ({ context, page }) => {
    const f = await fixture(context);
    await context.addInitScript(failure => {
      if (failure === "locks") Object.defineProperty(navigator, "locks", { value: undefined });
      else Object.defineProperty(window, "localStorage", { get: () => { throw new Error("blocked storage"); } });
    }, failure);
    await page.goto("/__hns-wallet");
    if (failure === "locks") await bob(page).click();
    await expect(page.getByText("storage or locking could not be used", { exact: false })).toBeVisible();
    await manual(page).click(); await expect.poll(() => f.calls.acknowledgements).toBe(1);
    expect(f.calls.sends).toHaveLength(0); expect(f.unexpected).toEqual([]);
  });
}
