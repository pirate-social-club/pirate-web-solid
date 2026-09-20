import { spawn, type ChildProcess } from "node:child_process";
import { connect } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test, type BrowserContext, type Page } from "playwright/test";

/** Local browser proof of the song-first composer wiring, with every provider
 * doubled except the guide audio, which is a real element. It covers the
 * ordering, the guide's limit and start boundary, the duration guard, the
 * review surface, the attribution links and the complete "Use this song"
 * journey to a published video. It does not prove real camera/encoder
 * behavior, microphone permission or audio synchronization on a device;
 * those remain explicit open items in the task record. */

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
  readonly guideDelayMs: number | null;
  readonly stopped: number;
  readonly guideFails: boolean;
  readonly slowGuide: boolean;
  readonly guideNudgeMs: number;
  readonly reserveBody: Record<string, unknown> | null;
  readonly alignedDurationMs: number | null;
  readonly alignedFirstFrameMs: number | null;
  readonly alignedFirstFrameGreen: boolean | null;
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

async function open(userDataDir: string, path = proofPath): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: 1280, height: 1400 },
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(`${origin}${path}`);
  await page.locator("pre[data-proof-result]").waitFor();
  return context;
}

test("the excerpt is chosen before capture, guides the take and ends it", async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), "pirate-song-video-"));
  let context: BrowserContext | undefined;
  try {
    context = await open(userDataDir, `${proofPath}?compose=video&song=song-fixture`);
    const page = context.pages()[0] ?? await context.newPage();
    // The window control exists before any clip is chosen or recorded.
    await expect(page.getByLabel("Song position, moves the excerpt window")).toBeVisible();
    await expect(page.locator("textarea")).toHaveCount(0);
    await expect(page.getByText("Fixture song", { exact: true }).first()).toBeVisible();

    const startedAt = Date.now();
    await page.getByRole("button", { name: "Start recording", exact: true }).click();
    await expect.poll(async () => (await readLedger(page)).guidePlayed).toBeGreaterThan(0);
    // The guide is real media, so a start delay is measured rather than assumed.
    await expect.poll(async () => (await readLedger(page)).guideDelayMs).not.toBeNull();
    const during = await readLedger(page);
    // The take is limited to the excerpt plus its tail guard, and the guide
    // starts at the window's start.
    expect(during.limitMs).toBe(5_250);
    expect(during.guideStart).toBe(0);
    expect(during.guideDelayMs!).toBeLessThan(750);
    // The fake capture stops at the requested duration, not a constant.
    await expect.poll(async () => (await readLedger(page)).stopped, { timeout: 15_000 }).toBe(1);
    expect(Date.now() - startedAt).toBeGreaterThan(2_500);

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
    context = await open(userDataDir, `${proofPath}?compose=video&song=song-fixture`);
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
    context = await open(userDataDir, `${proofPath}?compose=video&song=song-fixture`);
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

test("a guide that starts too late ends the take", async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), "pirate-song-video-"));
  let context: BrowserContext | undefined;
  try {
    context = await open(userDataDir, `${proofPath}?compose=video&song=song-fixture`);
    const page = context.pages()[0] ?? await context.newPage();
    await page.getByRole("button", { name: "Slow the next guide", exact: true }).click();
    await page.getByRole("button", { name: "Start recording", exact: true }).click();
    await expect(page.getByText("started too late", { exact: false })).toBeVisible({ timeout: 15_000 });
    const ledger = await readLedger(page);
    expect(ledger.guideDelayMs).not.toBeNull();
    expect(ledger.guideDelayMs!).toBeGreaterThan(750);
  } finally {
    await context?.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test("a guided take is trimmed to the guide's start and its first frame follows it", async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), "pirate-song-video-"));
  let context: BrowserContext | undefined;
  try {
    context = await open(userDataDir, `${proofPath}?compose=video&song=song-fixture`);
    const page = context.pages()[0] ?? await context.newPage();
    await page.getByRole("button", { name: "Nudge the next guide 300ms", exact: true }).click();
    await page.getByRole("button", { name: "Start recording", exact: true }).click();
    await expect.poll(async () => (await readLedger(page)).stopped, { timeout: 20_000 }).toBe(1);
    await expect.poll(async () => (await readLedger(page)).alignedFirstFrameGreen, { timeout: 20_000 }).not.toBeNull();
    const ledger = await readLedger(page);
    // The guide was audible a known delay after the encoder started.
    expect(ledger.guideDelayMs).toBeGreaterThanOrEqual(250);
    expect(ledger.guideDelayMs).toBeLessThan(750);
    // The six-second take was generated with its marker at that delay; after
    // alignment its first frame is the first frame after the guide started,
    // and its duration lost exactly that lead-in.
    const expected = 6_000 - ledger.guideDelayMs!;
    expect(ledger.alignedDurationMs!).toBeGreaterThan(expected - 250);
    expect(ledger.alignedDurationMs!).toBeLessThan(expected + 250);
    expect(ledger.alignedFirstFrameMs).toBe(0);
    expect(ledger.alignedFirstFrameGreen).toBe(true);
  } finally {
    await context?.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test("a guide that stalls mid-take ends the recording", async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), "pirate-song-video-"));
  let context: BrowserContext | undefined;
  try {
    context = await open(userDataDir, `${proofPath}?compose=video&song=song-fixture`);
    const page = context.pages()[0] ?? await context.newPage();
    await page.getByRole("button", { name: "Start recording", exact: true }).click();
    await expect.poll(async () => (await readLedger(page)).guidePlayed).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Stall the guide now", exact: true }).click();
    await expect(page.getByText("stalled", { exact: false })).toBeVisible();
    await expect.poll(async () => (await readLedger(page)).stopped).toBe(1);
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
    // The song post offers the entry with the song's authoritative identity.
    await expect(page.getByRole("link", { name: "Use this song", exact: true }))
      .toHaveAttribute("href", "/c/community-fixture?compose=video&song=song-fixture");
    await page.getByRole("link", { name: "Use this song", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/c/community-fixture\\?compose=video&song=song-fixture$`));
    // The composer opens on that song, and the chip resolves its link.
    await expect(page.getByLabel("Song position, moves the excerpt window")).toBeVisible();
    await expect(page.locator('[data-song-chip="song-fixture"]'))
      .toHaveAttribute("href", "/posts/fixture-song");
    await expect(page.locator('[data-song-chip="song-fixture"]'))
      .toContainText("Fixture author");
  } finally {
    await context?.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test("the complete Use this song journey publishes a song-backed video", async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), "pirate-song-video-"));
  let context: BrowserContext | undefined;
  try {
    context = await open(userDataDir);
    const page = context.pages()[0] ?? await context.newPage();
    await page.getByRole("link", { name: "Use this song", exact: true }).click();
    await expect(page.getByLabel("Song position, moves the excerpt window")).toBeVisible();
    await page.getByRole("button", { name: "Start recording", exact: true }).click();
    await expect.poll(async () => (await readLedger(page)).stopped, { timeout: 15_000 }).toBe(1);
    await expect(page.locator("textarea")).toBeVisible();
    await page.getByRole("button", { name: "Publish video", exact: true }).click();
    await expect(page.getByRole("link", { name: "View published post", exact: true })).toBeVisible({ timeout: 15_000 });
    const ledger = await readLedger(page);
    expect(ledger.calls).toContain("command:reserve");
    expect(ledger.calls).toContain("command:start");
    expect(ledger.calls).toContain("command:finalize");
    expect(ledger.reserveBody).toMatchObject({
      intent: "song_reference",
      song_post_id: "song-fixture",
      clip_start_samples: 0,
      clip_duration_samples: 4_000 * 48,
      selected_from: { kind: "library" },
    });
  } finally {
    await context?.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
