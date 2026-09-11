import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./page-shell.tsx", import.meta.url), "utf8");

describe("CommunityPageShell theme contract", () => {
  it("uses the semantic page background for the shell root", () => {
    const root = source.match(/<div class="([^"]+)" data-community-page>/);
    expect(root?.[1]).toContain("bg-background");
    expect(root?.[1]).not.toContain("bg-primary");
  });
});
