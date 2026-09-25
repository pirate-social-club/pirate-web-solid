import { createPirateApiClient, type PirateApiClient } from "@pirate/api-client";

import { createGeneratedApiClient, readCsrfCookie, sessionRequestOptions } from "../../../api/client";
import type { ApiFetch } from "../../../api/proxy";

type Start = Awaited<ReturnType<PirateApiClient["post_communitiesCommunityIdSpacesOwnershipStart"]>>;
type Poll = Awaited<ReturnType<PirateApiClient["post_communitiesCommunityIdSpacesOwnershipPoll"]>>;

export interface SpacesOwnerProofApi {
  start(input: { communityId: string; canonicalRoot: string; idempotencyKey: string }): Promise<Start>;
  poll(input: { communityId: string; ceremonyId: string; idempotencyKey: string; signatureHex: string }): Promise<Poll>;
}

export function createSpacesOwnerProofApi(options: {
  fetchImpl?: ApiFetch;
  origin?: string | URL;
  readCsrfToken?: () => string | undefined;
} = {}): SpacesOwnerProofApi {
  let client: PirateApiClient | undefined;
  const getClient = () => client ??= createGeneratedApiClient(createPirateApiClient,
    { fetchImpl: options.fetchImpl, origin: options.origin }, { credentials: "same-origin" });
  const writeOptions = () => {
    const csrf = (options.readCsrfToken ?? readCsrfCookie)();
    if (csrf === undefined) throw new Error("Refresh the page before proving ownership.");
    return sessionRequestOptions(csrf);
  };
  return {
    start: ({ communityId, canonicalRoot, idempotencyKey }) => getClient()
      .post_communitiesCommunityIdSpacesOwnershipStart({
        path: { communityId }, body: { idempotency_key: idempotencyKey, canonical_root: canonicalRoot },
      }, writeOptions()),
    poll: ({ communityId, ceremonyId, idempotencyKey, signatureHex }) => getClient()
      .post_communitiesCommunityIdSpacesOwnershipPoll({
        path: { communityId }, body: { ceremony_id: ceremonyId, idempotency_key: idempotencyKey,
          signature_hex: signatureHex },
      }, writeOptions()),
  };
}
