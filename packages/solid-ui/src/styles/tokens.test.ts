import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const tokens = readFileSync(path.resolve("src/styles/tokens.css"), "utf8");

describe("sidebar theme tokens", () => {
  it("defines dark, light, and Tailwind mappings for the complete sidebar family", () => {
    for (const [name, colorName] of [
      ["background", "sidebar"],
      ["foreground", "sidebar-foreground"],
      ["primary", "sidebar-primary"],
      ["primary-foreground", "sidebar-primary-foreground"],
      ["accent", "sidebar-accent"],
      ["accent-foreground", "sidebar-accent-foreground"],
      ["border", "sidebar-border"],
      ["ring", "sidebar-ring"],
    ]) {
      expect(tokens.match(new RegExp(`--sidebar-${name}:`, "g"))?.length).toBe(2);
      expect(tokens).toContain(`--color-${colorName}: var(--sidebar-${name});`);
    }
  });
});
