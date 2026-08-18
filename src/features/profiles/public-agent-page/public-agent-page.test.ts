import { describe, expect, test } from "bun:test";

import { formatAgentCreatedAt } from "./public-agent-page.model";

describe("public agent page", () => {
  test("formats creation dates in UTC and fails closed for invalid fixtures", () => {
    expect(formatAgentCreatedAt("2026-04-27T12:00:00Z")).toBe("Apr 27, 2026");
    expect(formatAgentCreatedAt(1777291200)).toBe("Apr 27, 2026");
    expect(formatAgentCreatedAt("not-a-date")).toBe("Unknown creation date");
  });
});
