import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test, type BrowserContext, type Page } from "playwright/test";

const repoRoot = join(import.meta.dirname, "..");
const origin = "http://127.0.0.1:4198";
const proofPath = "/__video-proof";
const ledgerKey = "video-browser-proof-server";

type FixtureLedger = {
  readonly calls: string[];
  readonly failed: boolean;
  readonly finalized: boolean;
  readonly denied: boolean;
};

type FixtureProof = {
  readonly source: string | null;
  readonly community: string | null;
  readonly persona: string | null;
  readonly operation: string | null;
  readonly parts: number[];
  readonly pending: string | null;
  readonly status: string | null;
  readonly phase: string | null;
  readonly server: FixtureLedger;
};

let server: ChildProcess | undefined;
let serverOutput = "";

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null && server?.exitCode !== undefined) {
      throw new Error(`fixture server exited with ${server.exitCode}: ${serverOutput.slice(-2_000)}`);
    }
    try {
      const response = await fetch(`${origin}${proofPath}`);
      if (response.ok) return;
    } catch {
      void 0;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`fixture server did not become ready: ${serverOutput.slice(-2_000)}`);
}

async function readProof(page: Page): Promise<Partial<FixtureProof>> {
  const text = await page.locator("pre[data-proof-result]").textContent();
  return text !== null && text.trim().startsWith("{") ? JSON.parse(text) as FixtureProof : {};
}

function readLedger(page: Page): Promise<FixtureLedger> {
  return page.evaluate(key => {
    const raw = localStorage.getItem(key);
    return raw === null ? { calls: [], failed: false, finalized: false, denied: false } : JSON.parse(raw) as FixtureLedger;
  }, ledgerKey);
}

function launch(userDataDir: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: 1280, height: 1400 },
  });
}

function click(page: Page, name: string): Promise<void> {
  return page.getByRole("button", { name, exact: true }).click();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  server = spawn(process.execPath, ["scripts/video-browser-proof-server.mjs"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", chunk => { serverOutput += String(chunk); });
  server.stderr?.on("data", chunk => { serverOutput += String(chunk); });
  await waitForServer();
});

test.afterAll(async () => {
  if (server === undefined) return;
  const exited = new Promise<void>(resolve => { server?.once("exit", () => resolve()); });
  server.kill("SIGTERM");
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5_000))]);
  if (server.exitCode === null) server.kill("SIGKILL");
});

test("retains the interrupted upload across a browser restart and completes one logical submission", async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), "pirate-video-recovery-"));
  let context: BrowserContext | undefined;
  try {
    context = await launch(userDataDir);
    let page = context.pages()[0] ?? await context.newPage();
    await page.goto(`${origin}${proofPath}`);
    await page.locator("pre[data-proof-result]").waitFor();

    await click(page, "Start interrupted upload");
    await expect.poll(async () => (await readProof(page)).parts).toEqual([1]);
    const opened = await readProof(page);
    expect(opened.source).toBe("abcdefghi");
    expect(opened.community).toBe("community-fixture");
    expect(opened.persona).toBe("persona-fixture");
    expect(opened.operation).toBe("submission-fixture");

    const before = await readLedger(page);
    expect(before.finalized).toBe(false);
    expect(before.failed).toBe(true);
    expect(before.calls.filter(call => call === "reserve")).toHaveLength(1);
    expect(before.calls.filter(call => call === "start")).toHaveLength(1);
    expect(before.calls.filter(call => call === "put:1")).toHaveLength(1);
    expect(before.calls.filter(call => call === "put:2")).toHaveLength(1);

    await context.close();
    context = undefined;
    await new Promise(resolve => setTimeout(resolve, 2_500));

    context = await launch(userDataDir);
    page = context.pages()[0] ?? await context.newPage();
    await page.goto(`${origin}${proofPath}`);
    await page.locator("pre[data-proof-result]").waitFor();

    await click(page, "Restore retained operation");
    await expect.poll(async () => (await readProof(page)).operation).toBe("submission-fixture");
    const restored = await readProof(page);
    expect(restored.source).toBe("abcdefghi");
    expect(restored.parts).toEqual([1]);

    const restartAt = (await readLedger(page)).calls.length;
    await click(page, "Resume upload");
    await expect.poll(async () => (await readLedger(page)).finalized, { timeout: 30_000 }).toBe(true);

    const completed = await readProof(page);
    expect(completed.operation).toBe("submission-fixture");
    expect(completed.parts).toEqual([1, 2, 3]);
    expect(completed.status).toBe("processing");

    const final = await readLedger(page);
    const resumed = final.calls.slice(restartAt);
    expect(resumed.filter(call => call === "reserve")).toHaveLength(0);
    expect(resumed.filter(call => call === "start")).toHaveLength(0);
    expect(resumed).not.toContain("put:1");
    const renewed = resumed
      .filter(call => call.startsWith("renew:"))
      .flatMap(call => call.slice("renew:".length).split(",").map(Number));
    expect([...new Set(renewed)].sort((left, right) => left - right)).toEqual([2, 3]);
    expect(resumed.filter(call => call === "finalize").length).toBeGreaterThanOrEqual(1);
  } finally {
    await context?.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test("refuses denied playback access without serving media or minting again", async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), "pirate-video-denial-"));
  let context: BrowserContext | undefined;
  try {
    context = await launch(userDataDir);
    await context.addInitScript((key: string) => {
      localStorage.setItem(key, JSON.stringify({ calls: [], failed: false, finalized: false, denied: true }));
    }, ledgerKey);
    const page = context.pages()[0] ?? await context.newPage();
    const mediaRequests: string[] = [];
    page.on("request", request => {
      if (request.url().includes("/__video-media/")) mediaRequests.push(request.url());
    });
    await page.goto(`${origin}${proofPath}`);
    const player = page.locator("[data-video-player-state]");
    await player.scrollIntoViewIfNeeded();

    await expect
      .poll(async () => (await readLedger(page)).calls.filter(call => call === "mint").length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect(player).toHaveAttribute("data-video-player-state", "unavailable");

    const mints = (await readLedger(page)).calls.filter(call => call === "mint").length;
    await page.waitForTimeout(2_500);
    expect((await readLedger(page)).calls.filter(call => call === "mint")).toHaveLength(mints);
    expect(mediaRequests).toHaveLength(0);

    await page.evaluate((key: string) => {
      const raw = localStorage.getItem(key);
      const state = raw === null
        ? { calls: [], failed: false, finalized: false, denied: true }
        : JSON.parse(raw) as FixtureLedger;
      localStorage.setItem(key, JSON.stringify({ ...state, denied: false }));
    }, ledgerKey);
    await page.waitForTimeout(10_500);
    await click(page, "Try playback again");
    await expect.poll(() => mediaRequests.length, { timeout: 20_000 }).toBeGreaterThan(0);
  } finally {
    await context?.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
