import { ApiClientError } from "@pirate/api-client";
import { describe, expect, it } from "vitest";
import { sponsorFailure } from "./reward-sponsor-errors.ts";

describe("sponsor error copy", () => {
  it("explains a deliberate pause while preserving the saved attempt", () => {
    const definition = { status: 503, code: "rewards_paused", name: "RewardsPaused", retryable: true };
    const cause = new ApiClientError(definition, { error: { code: definition.code, message: "paused", retryable: true, details: null } });
    expect(sponsorFailure(cause)).toBe("Rewards are paused. Your saved attempt is kept; check its status after rewards resume.");
  });
  it("does not describe a genuine provider outage as a deliberate pause", () => {
    const definition = { status: 502, code: "provider_unavailable", name: "ProviderUnavailable", retryable: true };
    const cause = new ApiClientError(definition, { error: { code: definition.code, message: "provider down", retryable: true, details: null } });
    expect(sponsorFailure(cause)).not.toContain("Rewards are paused");
    expect(sponsorFailure(cause)).toContain("Keep your saved attempt");
  });
});
