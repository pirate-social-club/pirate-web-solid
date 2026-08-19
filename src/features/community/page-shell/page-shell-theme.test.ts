import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./page-shell.tsx", import.meta.url), "utf8");

describe("CommunityPageShell theme contract", () => {
  it("uses the semantic page background in desktop and mobile layouts", () => {
    expect(source).toContain('data-community-page');
    expect(source).toContain("bg-background");
    expect(source).toContain("bg-card");
    expect(source).not.toContain("bg-primary");
  });
});
