import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test, type BrowserContext, type Page } from "playwright/test";
import { createServer, type ViteDevServer } from "vite";

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
