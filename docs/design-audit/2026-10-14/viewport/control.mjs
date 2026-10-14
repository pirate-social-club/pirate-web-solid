// Control: load each story's preview frame directly at its requested size, so
// the play function runs at that size from the start. Records the outcome.
import fs from "node:fs";
import path from "node:path";
const [worktree, baseUrl, idsPath, outPath, repeat = "1"] = process.argv.slice(2);
const { chromium } = await import(path.join(worktree, "node_modules/playwright/index.mjs"));
const ids = JSON.parse(fs.readFileSync(idsPath, "utf8"));
const out = fs.createWriteStream(outPath);
const b = await chromium.launch();
const INIT = () => {
  const state = { phases: [], errors: [] };
  Object.defineProperty(globalThis, "__VP_PROBE__", { configurable: true, value: state });
  let channel;
  Object.defineProperty(globalThis, "__STORYBOOK_ADDONS_CHANNEL__", { configurable: true, get: () => channel, set: (c) => {
    channel = c; if (!c?.emit) return; const emit = c.emit.bind(c);
    c.emit = (name, ...a) => {
      if (name === "storyRenderPhaseChanged") state.phases.push({ phase: a[0]?.newPhase, w: innerWidth, h: innerHeight });
      if (name === "playFunctionThrewException" || name === "storyThrewException" || name === "storyErrored") state.errors.push(String(a[0]?.message ?? a[0]?.description ?? JSON.stringify(a[0])).slice(0, 300));
      return emit(name, ...a);
    };
  } });
};
for (const [id, w, h] of ids) for (let i = 0; i < Number(repeat); i += 1) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.addInitScript(INIT);
  await p.goto(`${baseUrl}/iframe.html?id=${id}&viewMode=story`);
  const res = await p.waitForFunction(() => { const s = globalThis.__VP_PROBE__; return s && s.phases.some((x) => ["completed", "errored", "playErrored", "finished"].includes(x.phase)) ? s : null; }, null, { timeout: 30000, polling: 50 }).then((h) => h.jsonValue()).catch(() => null);
  out.write(JSON.stringify({ id, w, h, phases: res?.phases ?? null, errors: res?.errors ?? null }) + "\n");
  await p.close();
}
out.end(); await b.close();
