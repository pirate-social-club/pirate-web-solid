import type { PirateApiClient } from "@pirate/api-client";

import {
  createSessionApiClient,
  readCsrfCookie,
  sessionRequestOptions,
} from "../../api/client";
import {
  decodeCommunityPurchaseFundingQuote,
  type CommunityPurchaseFundingIntent,
  type FundingQuoteClient,
} from "./funding-draft";

export interface CommunityPurchaseFundingClientOptions {
  readonly client?: Pick<PirateApiClient, "post_moneyCommunityPurchaseFundingQuotes">;
  readonly csrfToken?: string;
}

/**
 * Adapts the immutable generated 0.8.0 client to the draft controller. The
 * request body is constructed from the two intent fields only; session
 * credentials and the CSRF token remain owned by the shared API boundary.
 */
export function createCommunityPurchaseFundingClient(
  options: CommunityPurchaseFundingClientOptions = {},
): FundingQuoteClient {
  const client = options.client ?? createSessionApiClient();
  return {
    createQuote: async (intent: CommunityPurchaseFundingIntent) => {
      const csrfToken = options.csrfToken ?? readCsrfCookie();
      if (csrfToken === undefined) throw new Error("missing_csrf");
      const response = await client.post_moneyCommunityPurchaseFundingQuotes(
        { body: { community_id: intent.community_id, listing_id: intent.listing_id } },
        sessionRequestOptions(csrfToken),
      );
      const quote = decodeCommunityPurchaseFundingQuote(response);
      if (quote === null) throw new Error("invalid_quote_response");
      return quote;
    },
  };
}
