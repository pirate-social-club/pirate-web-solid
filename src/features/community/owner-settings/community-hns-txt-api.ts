import {
  createPirateApiClient,
  type PirateApiClient,
  type PostCommunitiesCommunityIdHnsTxtAttachmentsResponse,
} from "@pirate/api-client";
import { createGeneratedApiClient, readCsrfCookie, sessionRequestOptions } from "../../../api/client";
import type { ApiFetch } from "../../../api/proxy";

export type HnsTxtAttachment = PostCommunitiesCommunityIdHnsTxtAttachmentsResponse;

type TxtClient = Pick<PirateApiClient,
  | "post_communitiesCommunityIdHnsTxtAttachments"
  | "get_communitiesCommunityIdHnsTxtAttachments"
  | "post_communitiesCommunityIdHnsTxtAttachmentsAttachmentIntentIdCheck"
>;

export interface CommunityHnsTxtApi {
  current(communityId: string): Promise<HnsTxtAttachment | null>;
  start(communityId: string, rootLabel: string, idempotencyKey: string): Promise<HnsTxtAttachment>;
  check(communityId: string, attachmentIntentId: string, idempotencyKey: string): Promise<HnsTxtAttachment>;
}

export interface CommunityHnsTxtApiOptions {
  client?: TxtClient;
  fetchImpl?: ApiFetch;
  origin?: string | URL;
  readCsrfToken?: () => string | undefined;
}

function writeOptions(readToken: () => string | undefined) {
  const token = readToken();
  if (token === undefined) throw new Error("Refresh the page before changing this address.");
  return sessionRequestOptions(token);
}

export function createCommunityHnsTxtApi(options: CommunityHnsTxtApiOptions = {}): CommunityHnsTxtApi {
  let generated = options.client;
  const client = () => {
    generated ??= createGeneratedApiClient(
      createPirateApiClient,
      { fetchImpl: options.fetchImpl, origin: options.origin },
      { credentials: "same-origin" },
    );
    return generated;
  };
  const readToken = options.readCsrfToken ?? readCsrfCookie;
  return {
    async current(communityId) {
      const response = await client().get_communitiesCommunityIdHnsTxtAttachments({ path: { communityId } });
      return response.attachment;
    },
    start(communityId, rootLabel, idempotencyKey) {
      return client().post_communitiesCommunityIdHnsTxtAttachments({
        path: { communityId },
        body: { root_label: rootLabel, idempotency_key: idempotencyKey },
      }, writeOptions(readToken));
    },
    check(communityId, attachmentIntentId, idempotencyKey) {
      return client().post_communitiesCommunityIdHnsTxtAttachmentsAttachmentIntentIdCheck({
        path: { communityId, attachmentIntentId },
        body: { idempotency_key: idempotencyKey },
      }, writeOptions(readToken));
    },
  };
}
