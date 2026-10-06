import { ApiClientError, createPirateApiClient, type PirateApiClient } from "@pirate/api-client";

import { createGeneratedApiClient, readCsrfCookie, sessionRequestOptions } from "../../../api/client";
import { createPublicCommunityRouteClient } from "../../../api/community-route-client";
import type { ApiFetch } from "../../../api/proxy";

/**
 * Connecting an owned Spaces root as a community address. The owner signs one
 * message with their wallet; nothing is sent on chain and no key is handled here.
 */
export type SpacesRouteAttachmentStatus =
  | "awaiting_signature"
  | "proved"
  | "committed"
  | "expired"
  | "root_changed"
  | "signature_rejected"
  | "configuration_changed";

export interface SpacesRouteAttachmentState {
  status: SpacesRouteAttachmentStatus;
  attachment_intent_id: string;
  generation: number;
  purpose: "first_attachment" | "revalidation";
  canonical_root: string;
  public_origin: string;
  canonical_href: string;
  challenge_message: string;
  expires_at: string;
  route_binding_id: string | null;
  replayed: boolean;
}

export interface SpacesRouteAttachmentPending {
  status: "verification_pending";
  retry_after_seconds: number;
}

export type SpacesRouteAttachmentResult = SpacesRouteAttachmentState | SpacesRouteAttachmentPending;

export interface SpacesRouteAttachmentApi {
  start(input: { communityId: string; canonicalRoot: string; idempotencyKey: string }): Promise<SpacesRouteAttachmentResult>;
  /** The community's latest attempt, or null when it has never started one. */
  current(input: { communityId: string }): Promise<SpacesRouteAttachmentResult | null>;
  prove(input: { communityId: string; attachmentIntentId: string; signatureHex: string }): Promise<SpacesRouteAttachmentResult>;
  commit(input: { communityId: string; attachmentIntentId: string; generation: number }): Promise<SpacesRouteAttachmentResult>;
  /** Whether /c/@root reaches a community right now. A past success does not answer this. */
  resolves(input: { canonicalRoot: string }): Promise<boolean>;
}

/**
 * The owner's requests go through the same-origin proxy with the session
 * cookie and CSRF token. Whether the address works is asked the way any
 * visitor would ask it: the public lookup, with no credentials.
 */
export function createSpacesRouteAttachmentApi(options: {
  fetchImpl?: ApiFetch;
  origin?: string | URL;
  readCsrfToken?: () => string | undefined;
} = {}): SpacesRouteAttachmentApi {
  let client: PirateApiClient | undefined;
  const getClient = () => client ??= createGeneratedApiClient(createPirateApiClient,
    { fetchImpl: options.fetchImpl, origin: options.origin }, { credentials: "same-origin" });
  const writeOptions = () => {
    const csrf = (options.readCsrfToken ?? readCsrfCookie)();
    if (csrf === undefined) throw new Error("Refresh the page before connecting an address.");
    return sessionRequestOptions(csrf);
  };
  return {
    start: ({ communityId, canonicalRoot, idempotencyKey }) => getClient()
      .post_communitiesCommunityIdSpacesRouteAttachments({
        path: { communityId }, body: { idempotency_key: idempotencyKey, canonical_root: canonicalRoot },
      }, writeOptions()),
    current: async ({ communityId }) => {
      try {
        return await getClient().get_communitiesCommunityIdSpacesRouteAttachmentsCurrent({ path: { communityId } });
      } catch (reason) {
        if (reason instanceof ApiClientError && reason.status === 404) return null;
        throw reason;
      }
    },
    prove: ({ communityId, attachmentIntentId, signatureHex }) => getClient()
      .post_communitiesCommunityIdSpacesRouteAttachmentsAttachmentIntentIdProve({
        path: { communityId, attachmentIntentId }, body: { signature_hex: signatureHex },
      }, writeOptions()),
    commit: ({ communityId, attachmentIntentId, generation }) => getClient()
      .post_communitiesCommunityIdSpacesRouteAttachmentsAttachmentIntentIdCommit({
        path: { communityId, attachmentIntentId }, body: { generation },
      }, writeOptions()),
    resolves: async ({ canonicalRoot }) => {
      try {
        await createPublicCommunityRouteClient({ fetchImpl: options.fetchImpl, origin: options.origin })
          .get_cPathSegment({ path: { path_segment: `@${canonicalRoot}` } });
        return true;
      } catch (reason) {
        if (reason instanceof ApiClientError && reason.status === 404) return false;
        throw reason;
      }
    },
  };
}
