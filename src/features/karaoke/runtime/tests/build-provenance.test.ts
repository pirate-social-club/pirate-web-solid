import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

import { KARAOKE_RUNTIME_BUILD } from "../provenance";

const pkg = JSON.parse(
  readFileSync(resolve(import.meta.dir, "..", "package.json"), "utf8"),
) as { version: string };

/**
 * Contract test for the provenance entry (`@pirate-social-club/karaoke-runtime/build`) the API
 * relies on to surface `/__version` (karaoke-rankings spec §9a / packaging doc §6).
 * Requires `build-info.json`, which `scripts/build-provenance.ts` generates before
 * `bun test` and before `npm pack` (prepack).
 */
describe("karaoke-runtime provenance", () => {
  test("exports KARAOKE_RUNTIME_BUILD with version + gitSha", () => {
    expect(KARAOKE_RUNTIME_BUILD.version).toBe(pkg.version);
    expect(typeof KARAOKE_RUNTIME_BUILD.gitSha).toBe("string");
    expect(KARAOKE_RUNTIME_BUILD.gitSha.length).toBeGreaterThan(0);
  });
});
