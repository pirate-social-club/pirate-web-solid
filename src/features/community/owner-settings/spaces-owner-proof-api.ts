import { createPirateApiClient, type PirateApiClient } from "@pirate/api-client";

import { createGeneratedApiClient, readCsrfCookie, sessionRequestOptions } from "../../../api/client";
import type { ApiFetch } from "../../../api/proxy";

type Start = Awaited<ReturnType<PirateApiClient["post_communitiesCommunityIdSpacesOwnershipStart"]>>;
type Poll = Awaited<ReturnType<PirateApiClient["post_communitiesCommunityIdSpacesOwnershipPoll"]>>;
type Assignment = Awaited<ReturnType<PirateApiClient["get_communitiesCommunityIdSpacesOperatorAssignments"]>>;
type Confirmation = Awaited<ReturnType<PirateApiClient["post_communitiesCommunityIdSpacesOperatorAssignmentsConfirm"]>>;

export interface SpacesOwnerProofApi {
  start(input: { communityId: string; canonicalRoot: string; idempotencyKey: string }): Promise<Start>;
  poll(input: { communityId: string; ceremonyId: string; idempotencyKey: string; signatureHex: string }): Promise<Poll>;
  assignment(input: { communityId: string; root: string }): Promise<Assignment>;
  confirmAssignment(input: { communityId: string; idempotencyKey: string; assignmentId: string;
    generation: number; authorityReference: string; authorityGeneration: number }): Promise<Confirmation>;
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
    assignment: ({ communityId, root }) => getClient()
      .get_communitiesCommunityIdSpacesOperatorAssignments({ path: { communityId }, query: { root } }),
    confirmAssignment: ({ communityId, idempotencyKey, assignmentId, generation, authorityReference, authorityGeneration }) => getClient()
      .post_communitiesCommunityIdSpacesOperatorAssignmentsConfirm({ path: { communityId }, body: {
        idempotency_key: idempotencyKey, operator_assignment_id: assignmentId,
        expected_generation: generation, namespace_authority_reference: authorityReference,
        expected_authority_generation: authorityGeneration,
      } }, writeOptions()),
  };
}
