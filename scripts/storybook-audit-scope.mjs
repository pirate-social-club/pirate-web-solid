import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { importsOf, listFiles } from "./check-story-production-parity.mjs";

const root = path.resolve(import.meta.dirname, "..");
const storyPattern = /\.stories\.[cm]?[jt]sx?$/u;
const globalPattern = /^(?:packages\/solid-ui\/|\.storybook\/|public\/|patches\/|vite\.config\.|src\/locales\/|src\/lib\/ui-locale(?:-core)?\.tsx?$|src\/.*\.css$)/u;

/** Select app stories that import a changed module, including indirect imports. */
export function affectedStories(changedPaths, stories, dependencies = importsOf) {
  const changed = new Set(changedPaths.map((file) => path.resolve(root, file)));
  const cache = new Map();
  return stories.filter((story) => {
    const pending = [story];
    const visited = new Set();
    while (pending.length > 0) {
      const file = pending.pop();
      if (visited.has(file)) continue;
      visited.add(file);
      if (changed.has(file)) return true;
      if (!cache.has(file)) cache.set(file, dependencies(file));
      pending.push(...cache.get(file));
    }
    return false;
  }).sort();
}

export function auditPlan(eventName, changedPaths, stories, dependencies) {
  if (eventName !== "pull_request" || changedPaths.some((file) => globalPattern.test(file))) {
    return { scope: "full", filter: "", files: [], reason: "Main, manual, or shared UI/configuration change." };
  }
  const files = affectedStories(changedPaths, stories, dependencies)
    .map((file) => `./${path.relative(root, file).split(path.sep).join("/")}`);
  if (files.length === 0) {
    return { scope: "none", filter: "", files, reason: "No changed module is used by an app story. Verify still runs." };
  }
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return { scope: "affected", filter: `^(?:${files.map(escape).join("|")})$`, files, reason: "App stories importing changed modules." };
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? "")).href) {
  const eventName = process.env.GITHUB_EVENT_NAME;
  if (!eventName) throw new Error("GITHUB_EVENT_NAME is required");
  let changedPaths = [];
  if (eventName === "pull_request") {
    const base = process.env.STORYBOOK_BASE_SHA;
    if (!/^[a-f0-9]{40}$/iu.test(base ?? "")) throw new Error("A complete PR base SHA is required");
    changedPaths = execFileSync("git", ["diff", "--no-renames", "--name-only", "-z", base, "HEAD", "--"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  }
  const stories = listFiles(path.join(root, "src"), (file) => storyPattern.test(file));
  const plan = auditPlan(eventName, changedPaths, stories);
  mkdirSync(path.join(root, ".tmp/storybook-a11y"), { recursive: true });
  writeFileSync(path.join(root, ".tmp/storybook-a11y/scope.json"), `${JSON.stringify({ ...plan, changedPaths }, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `scope=${plan.scope}\nfilter=${plan.filter}\n`);
  const selection = plan.scope === "full" ? "Complete catalog selected." : `Selected app story files: ${plan.files.length}.`;
  const summary = `Storybook scope: ${plan.scope}. ${plan.reason} ${selection}\n`;
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary.trim());
}
