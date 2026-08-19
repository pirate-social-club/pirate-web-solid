import { describe, expect, it } from "vitest";
import {
  fetchFundingHarnessConfig,
  fundingHarnessConfigResponse,
  publicFundingHarnessConfig,
} from "./funding-harness.ts";

describe("funding harness public configuration", () => {
  it("is absent unless explicitly enabled with both fixture identifiers", () => {
    expect(publicFundingHarnessConfig({})).toBeUndefined();
    expect(
      publicFundingHarnessConfig({ FUNDING_HARNESS_ENABLED: "true", FUNDING_HARNESS_COMMUNITY_ID: "community" }),
    ).toBeUndefined();
    expect(
      publicFundingHarnessConfig({
        FUNDING_HARNESS_ENABLED: "true",
        FUNDING_HARNESS_COMMUNITY_ID: "community",
        FUNDING_HARNESS_LISTING_ID: " listing",
      }),
    ).toBeUndefined();
    expect(
      publicFundingHarnessConfig({
        FUNDING_HARNESS_ENABLED: "true",
        FUNDING_HARNESS_COMMUNITY_ID: "community",
        FUNDING_HARNESS_LISTING_ID: "listing",
      }),
    ).toEqual({ enabled: true, communityId: "community", listingId: "listing" });
  });

  it("serves only GET and never caches", async () => {
    const env = {
      FUNDING_HARNESS_ENABLED: "true",
      FUNDING_HARNESS_COMMUNITY_ID: "community",
      FUNDING_HARNESS_LISTING_ID: "listing",
    };
    expect(
      fundingHarnessConfigResponse(new Request("https://solid.test/config", { method: "POST" }), env).status,
    ).toBe(405);
    expect(fundingHarnessConfigResponse(new Request("https://solid.test/config"), {}).status).toBe(404);
    const response = fundingHarnessConfigResponse(new Request("https://solid.test/config"), env);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ enabled: true, communityId: "community", listingId: "listing" });
  });

  it("strictly validates the browser response", async () => {
    const config = await fetchFundingHarnessConfig(async () =>
      Response.json({ enabled: true, communityId: "community", listingId: "listing" }));
    expect(config.listingId).toBe("listing");
    await expect(
      fetchFundingHarnessConfig(async () =>
        Response.json({ enabled: true, communityId: "community", listingId: "listing", secret: "no" })),
    ).rejects.toThrow("funding_harness_unavailable");
  });
});
