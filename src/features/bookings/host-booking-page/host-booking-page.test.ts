import { describe, expect, test } from "bun:test";

import { formatCentsAsUsdc } from "../booking-format";

describe("host booking page", () => {
  test("keeps the displayed price precise for the profile CTA", () => {
    expect(formatCentsAsUsdc(5000)).toBe("50.00 USDC");
  });
});
