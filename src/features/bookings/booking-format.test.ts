import { describe, expect, test } from "bun:test";
import {
  formatCentsAsUsdc,
  formatSlotDuration,
  formatTzLabel,
  getSlotUniformity,
} from "./booking-format";

describe("booking format foundation", () => {
  test("formats stable USDC amounts and slot durations", () => {
    expect(formatCentsAsUsdc(1234)).toBe("12.34 USDC");
    expect(formatSlotDuration("2026-01-01T10:00:00Z", "2026-01-01T10:30:00Z")).toBe(
      "30 min",
    );
    expect(formatSlotDuration("2026-01-01T10:00:00Z", "2026-01-01T11:30:00Z")).toBe(
      "1 hr 30 min",
    );
  });

  test("detects independent duration and price variation", () => {
    expect(getSlotUniformity([])).toEqual({ sameDuration: true, samePrice: true });
    expect(
      getSlotUniformity([
        {
          startUtc: "2026-01-01T10:00:00Z",
          endUtc: "2026-01-01T10:30:00Z",
          priceCents: 1_000,
        },
        {
          startUtc: "2026-01-01T11:00:00Z",
          endUtc: "2026-01-01T12:00:00Z",
          priceCents: 1_000,
        },
      ]),
    ).toEqual({ sameDuration: false, samePrice: true });
  });

  test("turns an IANA timezone identifier into a display label", () => {
    expect(formatTzLabel("America/Los_Angeles")).toBe("Los Angeles");
  });
});
