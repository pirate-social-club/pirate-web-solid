import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Story-to-production parity check.
 *
 * Every app story (any .stories.tsx file under src) must only import modules
 * that are reachable from the production entrypoints (App, entries, worker,
 * middleware, routes). A story for a component no route mounts is how the
 * catalog came to show UI users cannot reach; this check fails when one
 * appears again.
 *
 * The design-system catalog (packages/solid-ui) is not policed here: it exists
 * to show primitives before the app adopts them. App stories are held to what
 * ships. Run: node scripts/check-story-production-parity.mjs
 */

const root = path.resolve(import.meta.dirname, "..");
const srcRoot = path.join(root, "src");
const solidUiRoot = path.join(root, "packages", "solid-ui", "src");

const declarationPattern = /^[ \t]*(import|export)\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/gmu;
const sideEffectPattern = /^[ \t]*import\s*["']([^"']+)["']/gmu;
const dynamicPattern = /import\s*\(\s*["']([^"']+)["']\s*\)/gu;

/** True when a declaration's clause names only types, which are erased at runtime. */
function typeOnlyClause(clause) {
  const trimmed = clause.trim();
  if (/^type\s/u.test(trimmed)) return true;
  const braces = /^\{([\s\S]*)\}$/u.exec(trimmed);
  if (!braces) return false;
  const names = braces[1].split(",").map((name) => name.trim()).filter(Boolean);
  return names.length > 0 && names.every((name) => /^type\s/u.test(name));
}

/**
 * The module specifiers a file loads at runtime. Type-only imports and
 * re-exports are left out: they are erased, so a route that only names a
 * module's types does not make that module's components reachable.
 */
export function runtimeSpecifiers(text) {
  const specifiers = [];
  for (const match of text.matchAll(declarationPattern)) {
    if (!typeOnlyClause(match[2])) specifiers.push(match[3]);
  }
  for (const match of text.matchAll(sideEffectPattern)) specifiers.push(match[1]);
  for (const match of text.matchAll(dynamicPattern)) specifiers.push(match[1]);
  return specifiers;
}

const ENTRY_FILES = ["src/App.tsx", "src/Document.tsx", "src/entry-client.tsx", "src/entry-server.tsx", "src/middleware.ts", "src/worker.ts"];
const ENTRY_DIRECTORIES = ["src/routes"];

/** Story files whose imports are accepted despite the rule, with a reason. */
const ALLOWED_STORIES = new Map([
  // Owner-directed real-component preview before route wiring; see the current
  // brief in tasks/records/solid-hns-names-page-member-journey.md. Remove after wiring.
  // Add "src/.../x.stories.tsx": "reason" only with a recorded
  // justification; the parity review that added this check started empty.
]);

/**
 * Story-only support modules: fixtures, fakes and story frames that exist to
 * feed stories data. They are not components pretending to ship, so importing
 * them is always allowed. A component named to dodge this pattern still fails
 * unless a real route reaches it.
 */
const STORY_INFRA_PATTERN = /(?:^|[\\/])(?:[^\\/]*(?:fixtures|fake-[^\\/]*|story-helpers|story-fixtures)[^\\/]*\.[cm]?tsx?)$/u;

const isStoryInfra = (file) => STORY_INFRA_PATTERN.test(path.basename(file));

export function listFiles(directory, predicate, accumulator = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) listFiles(filePath, predicate, accumulator);
    else if (predicate(filePath)) accumulator.push(filePath);
  }
  return accumulator;
}

const isStory = (filePath) => filePath.endsWith(".stories.tsx") || filePath.endsWith(".stories.ts");
const isTest = (filePath) => /\.test\.[cm]?[jt]sx?$/.test(filePath) || /\.test\.mjs$/.test(filePath);
const isSource = (filePath) => /\.(ts|tsx|mts|cts)$/.test(filePath);

function resolveSpecifier(specifier, fromFile) {
  let target = null;
  if (specifier.startsWith("@pirate/web-solid-ui")) {
    target = path.join(solidUiRoot, "index.tsx");
    const sub = specifier.replace("@pirate/web-solid-ui/?([^?]+)?$", "");
    if (sub && sub !== specifier) return null; // style exports only; not module graph
  } else if (specifier.startsWith("@/")) {
    const base = fromFile.startsWith(solidUiRoot + path.sep) ? solidUiRoot : srcRoot;
    target = path.join(base, specifier.slice(2));
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    target = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return null; // external package
  }
  for (const candidate of [target, `${target}.ts`, `${target}.tsx`, path.join(target, "index.ts"), path.join(target, "index.tsx")]) {
    if (candidate.endsWith(".ts") || candidate.endsWith(".tsx")) {
      try {
        readFileSync(candidate);
        return candidate;
      } catch {
        // try the next form
      }
    }
  }
  return null;
}

export function importsOf(file) {
  return runtimeSpecifiers(readFileSync(file, "utf8"))
    .map((specifier) => resolveSpecifier(specifier, file))
    .filter((resolved) => resolved !== null);
}

function productionReachableSet() {
  const queue = [];
  for (const entry of ENTRY_FILES) queue.push(path.join(root, entry));
  for (const directory of ENTRY_DIRECTORIES) {
    listFiles(path.join(root, directory), (filePath) => isSource(filePath) && !isStory(filePath) && !isTest(filePath), queue);
  }
  const reachable = new Set();
  while (queue.length > 0) {
    const file = queue.pop();
    if (reachable.has(file)) continue;
    reachable.add(file);
    for (const imported of importsOf(file)) {
      if (!reachable.has(imported) && !isStory(imported) && !isTest(imported)) queue.push(imported);
    }
  }
  return reachable;
}

export function collectViolations() {
  const reachable = productionReachableSet();
  const stories = listFiles(srcRoot, (filePath) => isStory(filePath) && !filePath.endsWith(".test.tsx"));
  const violations = [];
  for (const story of stories) {
    const relative = path.relative(root, story);
    if (ALLOWED_STORIES.has(relative)) continue;
    for (const imported of importsOf(story)) {
      if (!reachable.has(imported) && !isStoryInfra(imported)) {
        violations.push(`${relative} imports unreachable module ${path.relative(root, imported)}`);
      }
    }
  }
  return violations;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const violations = collectViolations();
  if (violations.length > 0) {
    console.error(`story-production-parity: ${violations.length} violation(s)`);
    for (const violation of violations) console.error(`  ${violation}`);
    console.error("A story must only import components a production route reaches. Delete the story, wire the component, or record an allowlist entry with a reason.");
    process.exit(1);
  }
  console.log(`story-production-parity: ok (${listFiles(srcRoot, (filePath) => isStory(filePath)).length} app stories checked)`);
}
