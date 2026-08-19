import { describe, expect, test } from "vitest";
import type { PirateApiClient } from "@pirate/api-client";

import {
  createCommunityPurchaseFundingClient,
  type CommunityPurchaseFundingClientOptions,
} from "./funding-api";

const quote = {
  quote_id: "quote-1",
  community_id: "community-1",
  listing_id: "listing-1",
  policy_version: 3,
  quoted_at: "2026-08-19T09:00:00.000Z",
  expires_at: "2026-08-19T09:10:00.000Z",
  replayed: false,
  funding: {
    chain_id: 8453,
    token_contract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    token_decimals: 6 as const,
    sender: "0x769a00000000000000000000000000000000ca15",
    recipient: "0x1111000000000000000000000000000000001111",
    amount_atomic: "12500000",
    required_confirmations: 3,
  },
};

describe("createCommunityPurchaseFundingClient", () => {
  test("sends only the two intent fields with the session CSRF options", async () => {
    let request: Parameters<PirateApiClient["post_moneyCommunityPurchaseFundingQuotes"]>[0] | undefined;
    let options: Parameters<PirateApiClient["post_moneyCommunityPurchaseFundingQuotes"]>[1] | undefined;
    const client: CommunityPurchaseFundingClientOptions["client"] = {
      post_moneyCommunityPurchaseFundingQuotes: async (input, requestOptions) => {
        request = input;
        options = requestOptions;
        return quote;
      },
    };

    const result = await createCommunityPurchaseFundingClient({ client, csrfToken: "csrf-token" }).createQuote({
      community_id: "community-1",
      listing_id: "listing-1",
    });

    expect(request).toEqual({ body: { community_id: "community-1", listing_id: "listing-1" } });
    expect(options?.credentials).toBe("same-origin");
    expect(options?.headers instanceof Headers ? options.headers.get("x-csrf-token") : null).toBe("csrf-token");
    expect(result).toEqual(quote);
  });

  test("rejects before the network when the readable CSRF cookie is absent", async () => {
    const client: CommunityPurchaseFundingClientOptions["client"] = {
      post_moneyCommunityPurchaseFundingQuotes: async () => quote,
    };

    await expect(createCommunityPurchaseFundingClient({ client }).createQuote({
      community_id: "community-1",
      listing_id: "listing-1",
    })).rejects.toThrow("missing_csrf");
  });

  test("rejects a response that does not match the frozen quote contract", async () => {
    const client: CommunityPurchaseFundingClientOptions["client"] = {
      // SAFETY: this test deliberately supplies an invalid transport payload
      // to verify the adapter's runtime decoder rejects it.
      post_moneyCommunityPurchaseFundingQuotes: async () => ({}) as never,
    };

    await expect(createCommunityPurchaseFundingClient({ client, csrfToken: "csrf-token" }).createQuote({
      community_id: "community-1",
      listing_id: "listing-1",
    })).rejects.toThrow("invalid_quote_response");
  });
});
