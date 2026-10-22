import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test, type BrowserContext, type Page } from "playwright/test";
import { createServer, type ViteDevServer } from "vite";
import type { DanceSession } from "../src/features/dance/dance-preparation-api";
import { dancePreparationFixture } from "../src/features/dance/dance-preparation.fixture";

// A loopback module harness exercises native IndexedDB/Web Locks, not a live
// service or real participant video. It does not claim phone capture acceptance.
let server: ViteDevServer, origin: string;
const storagePath = "/src/features/dance/dance-recording-storage.ts";
const modelPath = "/src/features/dance/dance-recording.ts";
test.beforeAll(async () => {
  server = await createServer({ configFile: false, root: join(import.meta.dirname, ".."),
    server: { host: "127.0.0.1", port: 0 }, optimizeDeps: { noDiscovery: true } });
  server.middlewares.use((request, response, next) => {
    if (request.url !== "/__dance-storage") { next(); return; }
    response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><title>Local Dance storage fixture</title>");
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("fixture_origin_unavailable");
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await server?.close(); });

async function open(page: Page) {
  await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(`${origin}/__dance-storage`);
}
async function seed(page: Page, accountId = "dancer") {
  return page.evaluate(async ({ storagePath, modelPath, accountId }) => {
    const storageModule: typeof import("../src/features/dance/dance-recording-storage") = await import(storagePath);
    const model: typeof import("../src/features/dance/dance-recording") = await import(modelPath);
    const blob = new Blob(["fictional original recording"], { type: "video/mp4" });
    const metadata = { version: 1 as const, accountId, communityId: "community", postId: "song", personaId: "persona",
      choreographyId: "dance", choreographyRevision: 1, sessionId: "session", termsHash: "a".repeat(64), policyHash: "b".repeat(64),
      consentVersion: "consent-v1", consentHash: "c".repeat(64), retentionHash: "d".repeat(64), consentReceiptId: "receipt",
      durationMs: 12000, byteLength: blob.size, sha256: await model.danceRecordingDigest(blob), storedAtMs: 1000, expiresAtMs: 5000 };
    const storage = storageModule.createBrowserDanceRecordingStorage(accountId);
    await storage.exclusive("session", () => storage.add({ metadataJson: JSON.stringify(metadata), blob }, () => {}));
    return metadata;
  }, { storagePath, modelPath, accountId });
}

test("original survives browser restart; another account cannot read it; expiry deletes it at equality", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pirate-dance-storage-"));
  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(directory, { headless: true });
    let page = context.pages()[0] ?? await context.newPage(); await open(page);
    const metadata = await seed(page);
    await context.close(); context = undefined;
    context = await chromium.launchPersistentContext(directory, { headless: true });
    page = context.pages()[0] ?? await context.newPage(); await open(page);
    const restored = await page.evaluate(async path => {
      const module: typeof import("../src/features/dance/dance-recording-storage") = await import(path);
      const storage = module.createBrowserDanceRecordingStorage("dancer"), guard = () => {};
      const original = await storage.load("session", guard);
      const other = await module.createBrowserDanceRecordingStorage("other").load("session", guard);
      await storage.pruneExpired(4999, guard);
      const beforeExpiry = await storage.load("session", guard);
      await storage.pruneExpired(5000, guard);
      return { metadata: original && JSON.parse(original.metadataJson), text: await original?.blob.text(), other,
        beforeExpiry: !!beforeExpiry, afterExpiry: await storage.load("session", guard) };
    }, storagePath);
    expect(restored).toEqual({ metadata, text: "fictional original recording", other: null, beforeExpiry: true, afterExpiry: null });
  } finally { await context?.close(); await rm(directory, { recursive: true, force: true }); }
});

test("an atomic duplicate write and a revoked transaction leave the original unchanged", async ({ page }) => {
  await open(page); await seed(page);
  const result = await page.evaluate(async path => {
    const module: typeof import("../src/features/dance/dance-recording-storage") = await import(path);
    const storage = module.createBrowserDanceRecordingStorage("dancer"), guard = () => {};
    const original = await storage.load("session", guard);
    if (!original) throw new Error("fixture_missing");
    let duplicate = "";
    try { await storage.add(original, guard); } catch (error) { duplicate = error instanceof Error ? error.name : "unknown"; }
    const next = { ...original, metadataJson: original.metadataJson.replace('"sessionId":"session"', '"sessionId":"revoked"') };
    let checks = 0, revoked = "";
    try { await storage.add(next, () => { if (++checks === 3) throw new Error("authority_revoked"); }); }
    catch (error) { revoked = error instanceof Error ? error.message : "unknown"; }
    return { duplicate, revoked, checks, absent: await storage.load("revoked", guard), text: await (await storage.load("session", guard))?.blob.text() };
  }, storagePath);
  expect(result).toEqual({ duplicate: "ConstraintError", revoked: "authority_revoked", checks: 3, absent: null, text: "fictional original recording" });
});

test("a second tab cannot enter a held recording lock, then recovers after the first tab closes", async ({ page, context }) => {
  await open(page);
  await page.evaluate(async path => {
    const module: typeof import("../src/features/dance/dance-recording-storage") = await import(path);
    void module.createBrowserDanceRecordingStorage("dancer").exclusive("session", () => new Promise<void>(() => {
      document.body.dataset.lockHeld = "true";
    }));
  }, storagePath);
  await expect(page.locator("body")).toHaveAttribute("data-lock-held", "true");
  const other = await context.newPage(); await open(other);
  const attempt = () => other.evaluate(async path => {
    const module: typeof import("../src/features/dance/dance-recording-storage") = await import(path);
    try { return await module.createBrowserDanceRecordingStorage("dancer").exclusive("session", async () => "acquired"); }
    catch (error) { return error instanceof Error ? error.message : "unknown"; }
  }, storagePath);
  expect(await attempt()).toBe("dance_recording_busy");
  await page.close(); await expect.poll(attempt).toBe("acquired");
});

test("an interrupted conditional upload recovers original bytes and commands across browser restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pirate-dance-upload-"));
  let context: BrowserContext | undefined;
  let session: DanceSession = { ...dancePreparationFixture.session, state: "consented" };
  const commands: { operation: string; key: string }[] = [], received: string[] = [];
  let accesses = 0;
  const uploadUrl = `https://${"a".repeat(32)}.r2.cloudflarestorage.com/private/moderated-dance/ingress/00000000-0000-4000-8000-000000000000/source`;
  async function bind(page: Page) {
    await open(page);
    await page.route(`${origin}/api/**`, async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/users/me")) {
        await route.fulfill({ json: { object: "user", id: "dancer", verification_state: "unverified", created: 0,
          verification_capabilities: Object.fromEntries(["unique_human", "age_over_18", "minimum_age", "nationality", "gender", "wallet_score"].map(key => [key, { state: "unverified" }])) } }); return;
      }
      if (route.request().method() === "GET") { await route.fulfill({ json: session }); return; }
      expect(route.request().headers()["x-csrf-token"]).toBe("fixture-csrf");
      if (path.endsWith("/upload-access")) {
        accesses++;
        await route.fulfill({ json: { version: "dance-moderated-upload-access-v1", upload_id: "upload-original",
          url: `${uploadUrl}?fixture-grant=${accesses}`, expires_at_ms: 20000, content_type: "video/mp4", size_bytes: 23,
          required_headers: [{ name: "content-type", value: "video/mp4" }, { name: "if-none-match", value: "*" }] } }); return;
      }
      const body: { operation: string; idempotency_key: string } = route.request().postDataJSON();
      commands.push({ operation: body.operation, key: body.idempotency_key });
      if (path.endsWith("/upload")) session = { ...session, state: "awaiting_upload", upload_id: "upload-original", upload_state: "reserved" };
      else if (path.endsWith("/finalize-upload")) session = { ...session, upload_state: "sealing" };
      else throw new Error("unexpected_fixture_request");
      await route.fulfill({ json: { version: "dance-moderated-intake-receipt-v1", operation: body.operation, receipt_id: `${body.operation}-receipt`, session } });
    });
    await page.route(`${uploadUrl}*`, async route => {
      expect(route.request().method()).toBe("PUT"); expect(route.request().headers()["if-none-match"]).toBe("*");
      expect(route.request().headers()["cookie"]).toBeUndefined(); expect(route.request().headers()["x-csrf-token"]).toBeUndefined();
      received.push(route.request().postDataBuffer()?.toString("utf8") ?? "");
      // Simulate storage accepting the object, then losing its acknowledgement.
      if (received.length === 1) await route.abort("failed"); else await route.fulfill({ status: 412, body: "" });
    });
  }
  async function run(page: Page, initialize: boolean) {
    return page.evaluate(async initialize => {
      const paths = {
        authority: "/src/api/browser-session-events.ts", client: "/src/api/client.ts", fixture: "/src/features/dance/dance-preparation.fixture.ts",
        preparation: "/src/features/dance/dance-preparation-journal.ts", storage: "/src/features/dance/dance-recording-storage.ts",
        recording: "/src/features/dance/dance-recording.ts", upload: "/src/features/dance/dance-upload-controller.ts", api: "/src/features/dance/dance-upload-api.ts",
      };
      const authority: typeof import("../src/api/browser-session-events") = await import(paths.authority);
      const client: typeof import("../src/api/client") = await import(paths.client);
      const fixture: typeof import("../src/features/dance/dance-preparation.fixture") = await import(paths.fixture);
      const preparation: typeof import("../src/features/dance/dance-preparation-journal") = await import(paths.preparation);
      const storage: typeof import("../src/features/dance/dance-recording-storage") = await import(paths.storage);
      const recording: typeof import("../src/features/dance/dance-recording") = await import(paths.recording);
      const upload: typeof import("../src/features/dance/dance-upload-controller") = await import(paths.upload);
      const api: typeof import("../src/features/dance/dance-upload-api") = await import(paths.api);
      authority.establishSessionAuthority();
      const context = fixture.dancePreparationFixture, session = { ...context.session, state: "consented" } as const;
      const scope = { accountId: "dancer", communityId: session.community_id, postId: session.song_post_id, personaId: context.persona_id,
        choreographyId: session.choreography_id, choreographyRevision: session.choreography_revision };
      const store = preparation.createBrowserDanceJournalStore();
      const recordings = recording.createDanceRecordingController({ scope, currentScope: () => scope, preparationStore: store,
        storage: storage.createBrowserDanceRecordingStorage("dancer"), nowMs: () => 10000 });
      const signal = new AbortController().signal;
      if (initialize) {
        const journal = preparation.createDancePreparationJournal({ scope, currentScope: () => scope, store });
        const lease = await journal.exclusive(async handle => {
          handle.adopt({ ...context, session });
          handle.prepareConsent({ version: "dance-moderated-intake-v1", operation: "consent", idempotency_key: "original-consent", community_id: scope.communityId,
            session_id: session.session_id, terms_hash: session.terms_hash, consent_version: session.consent_version, consent_hash: session.consent_hash, retention_hash: session.retention_hash });
          return handle.claimCapture(handle.acknowledgeConsent({ version: "dance-moderated-intake-receipt-v1", operation: "consent", receipt_id: "consent-receipt", session }));
        });
        const ready = { kind: "capture_ready" as const, session, context: { ...context, session }, assertCurrent() {
          if (journal.read()?.revision !== lease.revision) throw new Error("lease_revoked");
        } };
        await recordings.retain(ready, { sessionId: session.session_id, termsHash: session.terms_hash, durationMs: session.body_end_ms,
          file: new File(["original-browser-bytes!"], "dance.mp4", { type: "video/mp4" }) }, signal);
      }
      const coordinator = upload.createDanceUploadController({ scope, currentScope: () => scope, store, recordings,
        api: api.createDanceUploadApi(client.createSessionApiClient({ origin: location.origin }), () => "fixture-csrf"), nowMs: () => 10000 });
      let outcome: string;
      try { outcome = (await coordinator.resume(session.session_id, signal)).kind; }
      catch (error) { outcome = error instanceof Error ? error.message : "unknown"; }
      const raw = localStorage.getItem(`${preparation.danceJournalKey(scope)}:upload:${session.session_id}`);
      return { outcome, raw, hasGrant: Object.values(localStorage).some(value => String(value).includes("fixture-grant")) };
    }, initialize);
  }
  try {
    context = await chromium.launchPersistentContext(directory, { headless: true });
    let page = context.pages()[0] ?? await context.newPage(); await bind(page);
    const first = await run(page, true);
    expect(first.outcome).toContain("fetch"); expect(first.hasGrant).toBe(false);
    const before: { reserveJson: string; putState: string } = JSON.parse(first.raw ?? "null");
    expect(before.putState).toBe("unknown"); expect(commands.map(command => command.operation)).toEqual(["reserve"]);
    await context.close(); context = undefined;
    context = await chromium.launchPersistentContext(directory, { headless: true });
    page = context.pages()[0] ?? await context.newPage(); await bind(page);
    const second = await run(page, false);
    expect(second.outcome).toBe("processing"); expect(second.hasGrant).toBe(false);
    const after: { reserveJson: string; putState: string } = JSON.parse(second.raw ?? "null");
    expect(after.reserveJson).toBe(before.reserveJson); expect(after.putState).toBe("already_present");
    expect(commands.map(command => command.operation)).toEqual(["reserve", "finalize"]);
    expect(received).toEqual(["original-browser-bytes!", "original-browser-bytes!"]); expect(accesses).toBe(2);
  } finally { await context?.close(); await rm(directory, { recursive: true, force: true }); }
});
