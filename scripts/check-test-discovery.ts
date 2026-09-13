#!/usr/bin/env bun
/**
 * Fails when a src test file is owned by no configured runner.
 *
 * Ownership means the file is matched by the include patterns of
 * vitest.app.config.ts, vitest.api.config.ts or vitest.ssr.config.ts, or is
 * recorded in scripts/test-discovery-allowlist.json while it is still an
 * unowned Bun-native inventory item. The allowlist is a ratchet: it may only
 * shrink. A file that gains a runner, stops importing bun:test, or is deleted
 * must leave the allowlist in the same change.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

const runners = [
  { config: "vitest.app.config.ts", name: "app-components" },
  { config: "vitest.api.config.ts", name: "api" },
  { config: "vitest.ssr.config.ts", name: "server-markup" },
] as const;

type RunnerGlob = { pattern: string; runner: string };

const globs: RunnerGlob[] = [];
for (const runner of runners) {
  const module = (await import(`${root}/${runner.config}`)) as {
    default?: { test?: { include?: string[] } };
  };
  const include = module.default?.test?.include ?? [];
  if (include.length === 0) {
    console.error(`check-test-discovery: ${runner.config} exposes no test include patterns`);
    process.exit(2);
  }
  for (const pattern of include) globs.push({ pattern, runner: runner.name });
}

const files = [
  ...new Bun.Glob("**/*.test.ts").scanSync({ cwd: `${root}/src` }),
  ...new Bun.Glob("**/*.test.tsx").scanSync({ cwd: `${root}/src` }),
]
  .map(file => `src/${file}`)
  .sort();

const allowlistPath = `${root}/scripts/test-discovery-allowlist.json`;
const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8")) as {
  runner?: string;
  files?: string[];
};
const allowlistRunner = allowlist.runner ?? "bun-unassigned";
const allowlisted = new Set(allowlist.files ?? []);

const failures: string[] = [];
const counts = new Map<string, number>();
const configured = new Map<string, string>();

function record(runner: string): void {
  counts.set(runner, (counts.get(runner) ?? 0) + 1);
}

for (const file of files) {
  const text = readFileSync(resolve(root, file), "utf8");
  const usesBun = /\bfrom\s+["']bun:test["']|import\(\s*["']bun:test["']\s*\)/.test(text);

  const matches = globs.filter(({ pattern }) => new Bun.Glob(pattern).match(file));
  if (matches.length > 0) {
    if (usesBun) {
      failures.push(
        `${file} imports bun:test but is matched by ${matches.map(match => match.runner).join(", ")}; convert it or stop that runner from claiming it`,
      );
      continue;
    }
    const match = matches[0];
    if (match === undefined) continue;
    configured.set(file, match.runner);
    record(match.runner);
    continue;
  }

  if (allowlisted.has(file)) {
    if (!usesBun) {
      failures.push(`${file} is allowlisted but no longer imports bun:test; remove the allowlist entry`);
      continue;
    }
    record(allowlistRunner);
    continue;
  }

  if (usesBun) {
    failures.push(
      `${file} imports bun:test and is owned by no configured runner; give it a runner or record it in scripts/test-discovery-allowlist.json`,
    );
  } else {
    failures.push(
      `${file} is owned by no configured runner; add it to vitest.app.config.ts or vitest.ssr.config.ts`,
    );
  }
}

for (const file of allowlist.files ?? []) {
  if (!files.includes(file)) {
    failures.push(`allowlist entry no longer exists: ${file}; remove it`);
  } else if (configured.has(file)) {
    failures.push(`allowlist entry is now matched by ${configured.get(file)}: ${file}; remove it`);
  }
}

const summary = [...counts.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([runner, count]) => `${runner} ${count}`)
  .join(", ");

if (failures.length > 0) {
  console.error(
    `check-test-discovery: ${failures.length} finding(s) across ${files.length} src test file(s)`,
  );
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(`check-test-discovery: ${files.length} src test file(s) owned (${summary})`);
