import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./app-sidebar.tsx", import.meta.url), "utf8");

test("sidebar navigation uses the sidebar contrast token family", () => {
  expect(source).toContain("bg-sidebar");
  expect(source).toContain("border-sidebar-border");
  expect(source).toContain("text-sidebar-foreground");
  expect(source).toContain("hover:bg-sidebar-accent");
  expect(source).toContain("hover:text-sidebar-accent-foreground");
  expect(source).toContain("bg-sidebar-primary");
  expect(source).toContain("text-sidebar-primary-foreground");
  expect(source).not.toContain("text-muted-foreground");
  expect(source).not.toContain("text-sidebar-foreground/60");
});

