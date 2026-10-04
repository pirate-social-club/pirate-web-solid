import type { PirateApiClient, PostVideoOutcomesClaimResponse } from "@pirate/api-client";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions, type ApiClientFactoryOptions } from "../../../api/client.ts";

export type VideoOutcomeClaim = PostVideoOutcomesClaimResponse;
export type VideoOutcome = Extract<VideoOutcomeClaim, { display_permission: true }>["outcome"];

/** A permanent claim is a write. A failed or lost response is never retried here. */
export async function claimVideoOutcome(options: ApiClientFactoryOptions & {
  readonly client?: Pick<PirateApiClient, "post_videoOutcomesClaim">;
  readonly csrfToken?: string;
  readonly signal?: AbortSignal;
} = {}): Promise<VideoOutcomeClaim> {
  const csrf = options.csrfToken ?? readCsrfCookie();
  if (csrf === undefined) throw new Error("A CSRF token is required");
  return (options.client ?? createSessionApiClient(options)).post_videoOutcomesClaim(
    { body: {} }, sessionRequestOptions(csrf, { signal: options.signal }),
  );
}
