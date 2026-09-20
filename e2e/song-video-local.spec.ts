import { spawn, type ChildProcess } from "node:child_process";
import { connect } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test, type BrowserContext, type Page } from "playwright/test";

/** Local browser proof of the song-first composer wiring, with every provider
 * doubled. It covers the ordering, the guide's limit, the duration guard, the
 * review surface and the attribution links. It does not prove real capture
 * timing, camera/microphone permission behavior or audio synchronization on a
 * device; those remain explicit open items in the task record. */

const repoRoot = join(import.meta.dirname, "..");
const origin = "http://127.0.0.1:4198";
const fixturePort = Number(new URL(origin).port);
const proofPath = "/__song-video-proof";
const serverReadyLine = "Video fixture browser proof:";

interface Ledger {
  readonly calls: readonly string[];
  readonly limitMs: number | null;
  readonly guidePlayed: number;
  readonly guidePaused: number;
  readonly guideStart: number | null;
  readonly stopped: number;
  readonly guideFails: boolean;
}

let server: ChildProcess | undefined;
let serverOutput = "";

function portIsOccupied(): Promise<boolean> {
  return new Promise(resolve => {
    const socket = connect({ host: "127.0.0.1", port: fixturePort });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
  });
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null && server?.exitCode !== undefined) {
      throw new Error(`fixture server exited with ${server.exitCode}: ${serverOutput.slice(-2_000)}`);
    }
    if (serverOutput.includes(serverReadyLine)) {
      const response = await fetch(`${origin}${proofPath}`).catch(() => undefined);
      if (response?.ok === true && server?.exitCode === null) return;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`fixture server did not become ready: ${serverOutput.slice(-2_000)}`);
}

async function readLedger(page: Page): Promise<Ledger> {
  const text = await page.locator("pre[data-proof-result]").textContent();
  return JSON.parse(text ?? "{}") as Ledger;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  if (await portIsOccupied()) {
    throw new Error(`fixture port ${fixturePort} is already occupied; refusing to reuse another server`);
  }
  server = spawn(process.execPath, ["scripts/video-browser-proof-server.mjs"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", chunk => { serverOutput += String(chunk); });
  server.stderr?.on("data", chunk => { serverOutput += String(chunk); });
  await waitForServer();
});

test.afterAll(async () => {
  if (server !== undefined) {
    const exited = new Promise<void>(resolve => { server?.once("exit", () => resolve()); });
    server.kill("SIGTERM");
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5_000))]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
});

async function open(userDataDir: string): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: 1280, height: 1400 },
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(`${origin}${proofPath}`);
  await page.locator("pre[data-proof-result]").waitFor();
  return context;
}

test("the excerpt is chosen before capture, guides the take and ends it", async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), "pirate-song-video-"));
  let context: BrowserContext | undefined;
  try {
    context = await open(userDataDir);
    const page = context.pages()[0] ?? await context.newPage();
    // The window control exists before any clip is chosen or recorded.
    await expect(page.getByLabel("Song position, moves the excerpt window")).toBeVisible();
    await expect(page.locator("textarea")).toHaveCount(0);
    await expect(page.getByText("Fixture song", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Start recording", exact: true }).click();
    await expect.poll(async () => (await readLedger(page)).guidePlayed).toBeGreaterThan(0);
    const during = await readLedger(page);
    // The take is limited to the excerpt plus its tail guard, and the guide
    // starts at the window's start.
    expect(during.limitMs).toBe(8_750);
    expect(during.guideStart).toBe(0);
    await expect.poll(async () => (await readLedger(page)).stopped).toBe(1);

    await expect(page.locator("textarea")).toBeVisible();
    await expect(page.getByText("Local preview with the intended soundtrack", { exact: false })).toBeVisible();
    await expect(page.locator("video[muted]")).toHaveCount(1);
    await expect(page.getByText("not the final master", { exact: false }).first()).toBeVisible();
  } finally {
    await context?.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test("an uploaded clip is measured against the excerpt before upload", async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), "pirate-song-video-"));
  let context: BrowserContext | undefined;
  try {
    context = await open(userDataDir);
    const page = context.pages()[0] ?? await context.newPage();
    await expect(page.getByLabel("Song position, moves the excerpt window")).toBeVisible();
    const input = page.locator('input[type="file"]');
    await input.setInputFiles({ name: "short.mp4", mimeType: "video/mp4", buffer: Buffer.from("short") });
    await expect(page.getByText("cannot be stretched", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Back to capture", exact: true }).click();
    await expect(page.locator("textarea")).toHaveCount(0);
    await input.setInputFiles({ name: "long.mp4", mimeType: "video/mp4", buffer: Buffer.from("long") });
    await expect(page.getByText("trimmed to the excerpt", { exact: false })).toBeVisible();
  } finally {
    await context?.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test("a guide that will not play cancels the take and says so", async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), "pirate-song-video-"));
  let context: BrowserContext | undefined;
  try {
    context = await open(userDataDir);
    const page = context.pages()[0] ?? await context.newPage();
    await page.getByRole("button", { name: "Fail the next guide", exact: true }).click();
    await page.getByRole("button", { name: "Start recording", exact: true }).click();
    await expect(page.getByText("guide song would not play", { exact: false })).toBeVisible();
    await expect.poll(async () => (await readLedger(page)).calls).toContain("capture:cancelled");
  } finally {
    await context?.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test("the song entry and the attribution chip link to their songs", async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), "pirate-song-video-"));
  let context: BrowserContext | undefined;
  try {
    context = await open(userDataDir);
    const page = context.pages()[0] ?? await context.newPage();
    await expect(page.getByRole("link", { name: "Use this song", exact: true }))
      .toHaveAttribute("href", "/c/community-fixture?compose=video&song=song-fixture");
    await expect(page.locator('[data-song-chip="song-fixture"]'))
      .toHaveAttribute("href", "/posts/fixture-song");
    await expect(page.locator('[data-song-chip="song-fixture"]'))
      .toContainText("Fixture author");
  } finally {
    await context?.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
