import { createPirateApiClient, type PirateApiClient } from "@pirate/api-client";

import { createGeneratedApiClient, readCsrfCookie, sessionRequestOptions } from "../../../api/client";
import type { ApiFetch } from "../../../api/proxy";

type Start = Awaited<ReturnType<PirateApiClient["post_communitiesCommunityIdSpacesOwnershipStart"]>>;
type Poll = Awaited<ReturnType<PirateApiClient["post_communitiesCommunityIdSpacesOwnershipPoll"]>>;
type Assignment = Awaited<ReturnType<PirateApiClient["get_communitiesCommunityIdSpacesOperatorAssignments"]>>;
type Confirmation = Awaited<ReturnType<PirateApiClient["post_communitiesCommunityIdSpacesOperatorAssignmentsConfirm"]>>;
export type SpacesOwnerProgress = Awaited<ReturnType<PirateApiClient["get_communitiesCommunityIdSpacesOwnership"]>>;
type Roots = Awaited<ReturnType<PirateApiClient["get_communitiesCommunityIdSpacesOwnershipRoots"]>>;

export interface SpacesOwnerProofApi {
  roots(input: { communityId: string; cursor?: string }, signal?: AbortSignal): Promise<Roots>;
  read(input: { communityId: string; root: string }, signal?: AbortSignal): Promise<SpacesOwnerProgress>;
  resume(input: { communityId: string; ceremonyId: string; idempotencyKey: string }, signal?: AbortSignal): Promise<Poll>;
  start(input: { communityId: string; canonicalRoot: string; idempotencyKey: string }, signal?: AbortSignal): Promise<Start>;
  poll(input: { communityId: string; ceremonyId: string; idempotencyKey: string; signatureHex: string }, signal?: AbortSignal): Promise<Poll>;
  assignment(input: { communityId: string; root: string }, signal?: AbortSignal): Promise<Assignment>;
  confirmAssignment(input: { communityId: string; idempotencyKey: string; assignmentId: string;
    generation: number; authorityReference: string; authorityGeneration: number }, signal?: AbortSignal): Promise<Confirmation>;
}

export function createSpacesOwnerProofApi(options: {
  fetchImpl?: ApiFetch;
  origin?: string | URL;
  readCsrfToken?: () => string | undefined;
} = {}): SpacesOwnerProofApi {
  let client: PirateApiClient | undefined;
  const getClient = () => client ??= createGeneratedApiClient(createPirateApiClient,
    { fetchImpl: options.fetchImpl, origin: options.origin }, { credentials: "same-origin" });
  const writeOptions = (signal?: AbortSignal) => {
    const csrf = (options.readCsrfToken ?? readCsrfCookie)();
    if (csrf === undefined) throw new Error("Refresh the page before proving ownership.");
    return sessionRequestOptions(csrf, { signal });
  };
  return {
    roots: ({ communityId, cursor }, signal) => getClient()
      .get_communitiesCommunityIdSpacesOwnershipRoots({ path: { communityId }, query: { cursor } }, { signal }),
    read: ({ communityId, root }, signal) => getClient()
      .get_communitiesCommunityIdSpacesOwnership({ path: { communityId }, query: { root } }, { signal }),
    resume: ({ communityId, ceremonyId, idempotencyKey }, signal) => getClient()
      .post_communitiesCommunityIdSpacesOwnershipResume({ path: { communityId }, body: {
        ceremony_id: ceremonyId, idempotency_key: idempotencyKey,
      } }, writeOptions(signal)),
    start: ({ communityId, canonicalRoot, idempotencyKey }, signal) => getClient()
      .post_communitiesCommunityIdSpacesOwnershipStart({
        path: { communityId }, body: { idempotency_key: idempotencyKey, canonical_root: canonicalRoot },
      }, writeOptions(signal)),
    poll: ({ communityId, ceremonyId, idempotencyKey, signatureHex }, signal) => getClient()
      .post_communitiesCommunityIdSpacesOwnershipPoll({
        path: { communityId }, body: { ceremony_id: ceremonyId, idempotency_key: idempotencyKey,
          signature_hex: signatureHex },
      }, writeOptions(signal)),
    assignment: ({ communityId, root }, signal) => getClient()
      .get_communitiesCommunityIdSpacesOperatorAssignments({ path: { communityId }, query: { root } }, { signal }),
    confirmAssignment: ({ communityId, idempotencyKey, assignmentId, generation, authorityReference, authorityGeneration }, signal) => getClient()
      .post_communitiesCommunityIdSpacesOperatorAssignmentsConfirm({ path: { communityId }, body: {
        idempotency_key: idempotencyKey, operator_assignment_id: assignmentId,
        expected_generation: generation, namespace_authority_reference: authorityReference,
        expected_authority_generation: authorityGeneration,
      } }, writeOptions(signal)),
  };
}
