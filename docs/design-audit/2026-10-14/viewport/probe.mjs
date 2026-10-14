// Viewport probe: report-only. For each story, navigates the Storybook manager
// exactly as scripts/storybook-a11y-sweep.mjs does (one page, 1280x720, manager
// URL with the a11y panel) and records the preview frame's size at each render
// phase, together with the viewport the story requests.
//
// Usage: node probe.mjs <worktree> <baseUrl> <out.jsonl> [idRegex]
import fs from "node:fs";
import path from "node:path";

const [worktree, baseUrl, outPath, idFilter] = process.argv.slice(2);
const { chromium } = await import(path.join(worktree, "node_modules/playwright/index.mjs"));
// storybook/viewport MINIMAL_VIEWPORTS (Storybook 10.6), the addon's default
// presets; checked against the installed package before this run.
const MINIMAL = {
  mobile1: { name: "Small mobile", styles: { height: "568px", width: "320px" }, type: "mobile" },
  mobile2: { name: "Large mobile", styles: { height: "896px", width: "414px" }, type: "mobile" },
  tablet: { name: "Tablet", styles: { height: "1112px", width: "834px" }, type: "tablet" },
  desktop: { name: "Desktop", styles: { height: "1024px", width: "1280px" }, type: "desktop" },
};

const index = JSON.parse(fs.readFileSync(path.join(worktree, "storybook-static/index.json"), "utf8"));
let stories = Object.values(index.entries).filter((entry) => entry.type === "story");
if (idFilter) stories = stories.filter((entry) => new RegExp(idFilter).test(entry.id));

// Runs in every frame. In the preview frame it hooks the preview channel and
// records the frame's size whenever the render phase changes.
const PROBE_INIT = () => {
  // The frame is still about:blank when this runs, so record unconditionally;
  // only the preview frame ever receives a channel.
  const state = { phases: [] };
  Object.defineProperty(globalThis, "__VP_PROBE__", { configurable: true, value: state });
  let channel;
  const attach = (candidate) => {
    channel = candidate;
    if (!candidate || typeof candidate.emit !== "function") return;
    // The preview emits render phases itself, so its own listeners never see
    // them; wrap emit to observe them.
    const emit = candidate.emit.bind(candidate);
    candidate.emit = (name, ...args) => {
      if (name === "storyRenderPhaseChanged") {
        state.phases.push({ phase: args[0]?.newPhase, storyId: args[0]?.storyId, w: innerWidth, h: innerHeight, t: performance.now() });
      }
      return emit(name, ...args);
    };
  };
  Object.defineProperty(globalThis, "__STORYBOOK_ADDONS_CHANNEL__", { configurable: true, get: () => channel, set: attach });
};

function storyUrl(id) {
  const url = new URL("/", `${baseUrl}/`);
  url.searchParams.set("path", `/story/${id}`);
  url.searchParams.set("addonPanel", "storybook/a11y/panel");
  return url.toString();
}

const px = (value) => (typeof value === "string" && value.endsWith("px") ? Number.parseFloat(value) : null);

function resolveViewport(config) {
  // config: { globalsViewport, parameterViewport }
  const requested = config.globalsViewport ?? null;
  const legacyDefault = config.parameterViewport?.defaultViewport ?? null;
  const options = { ...MINIMAL, ...(config.parameterViewport?.options ?? {}) };
  const value = requested?.value ?? null;
  if (value === null) return { requested: null, legacyDefault, resolved: null };
  if (value === "reset" || value === "responsive") return { requested, legacyDefault, resolved: { kind: "responsive" } };
  const preset = options[value];
  if (!preset) return { requested, legacyDefault, resolved: { kind: "unknown", value } };
  let width = px(preset.styles?.width);
  let height = px(preset.styles?.height);
  if (requested.isRotated) [width, height] = [height, width];
  return { requested, legacyDefault, resolved: { kind: "preset", value, name: preset.name, width, height } };
}

const out = fs.createWriteStream(outPath, { flags: "w" });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage(); // default 1280x720, as in the sweep
await page.addInitScript(PROBE_INIT);
page.setDefaultTimeout(30_000);

let done = 0;
for (const story of stories) {
  const record = { storyId: story.id, title: story.title, importPath: story.importPath };
  try {
    await page.goto(storyUrl(story.id), { waitUntil: "domcontentloaded" });
    const frame = await (async () => {
      for (let i = 0; i < 200; i += 1) {
        const candidate = page.frames().find((f) => f.url().includes("/iframe.html"));
        if (candidate) return candidate;
        await page.waitForTimeout(50);
      }
      throw new Error("preview frame not found");
    })();
    // Wait for a terminal phase for this story.
    const terminal = await frame.waitForFunction((id) => {
      const phases = globalThis.__VP_PROBE__?.phases?.filter((p) => p.storyId === id) ?? [];
      return phases.find((p) => ["completed", "errored", "aborted", "finished"].includes(p.phase)) ? phases : null;
    }, story.id, { timeout: 30_000, polling: 50 }).then((handle) => handle.jsonValue()).catch(() => null);
    // Let a late viewport resize land, then sample the settled size.
    await page.waitForTimeout(300);
    const settled = await frame.evaluate(() => ({ w: innerWidth, h: innerHeight }));
    const phases = terminal ?? (await frame.evaluate((id) => globalThis.__VP_PROBE__?.phases?.filter((p) => p.storyId === id) ?? []).catch(() => []));
    const config = await frame.evaluate(async (id) => {
      const preview = globalThis.__STORYBOOK_PREVIEW__;
      const story = await preview.storyStoreValue.loadStory({ storyId: id });
      return {
        globalsViewport: story.storyGlobals?.viewport ?? null,
        parameterViewport: story.parameters?.viewport ?? null,
        hasPlay: typeof story.playFunction === "function",
      };
    }, story.id).catch((error) => ({ error: String(error) }));
    const at = (name) => phases.find((p) => p.phase === name) ?? null;
    record.config = config;
    record.viewport = resolveViewport(config);
    record.hasPlay = config.hasPlay ?? null;
    record.phases = phases.map(({ phase, w, h, t }) => ({ phase, w, h, t: Math.round(t) }));
    record.playStart = at("playing") ? { w: at("playing").w, h: at("playing").h } : null;
    const end = at("played") ?? at("playErrored") ?? at("errored") ?? at("completed");
    record.playEnd = end ? { w: end.w, h: end.h, phase: end.phase } : null;
    record.settled = settled;
    record.terminalPhase = phases.at(-1)?.phase ?? null;
  } catch (error) {
    record.error = String(error?.message ?? error);
  }
  out.write(`${JSON.stringify(record)}\n`);
  done += 1;
  if (done % 50 === 0) console.error(`${done}/${stories.length}`);
}
out.end();
await browser.close();
