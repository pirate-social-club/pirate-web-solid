import {
  ApiClientError as PrimaryApiClientError,
  type ClearPostVoteResponse,
  type CreateCommentReplyResponse,
  type CreateCommentResponse,
  type ReportCommentResponse,
  type CastPostVoteResponse,
  type GetTextContentSubmissionResponse,
} from "@pirate/api-client";
import {
  ApiClientError as HappyPathApiClientError,
  createPirateApiClient,
  type GetCommunitiesCommunityIdModerationCasesCaseRefResponse,
  type PostModerationCasesCaseRefActionsInput,
  type PostModerationCasesCaseRefActionsResponse,
} from "@pirate/api-client-happy-path";

import {
  createGeneratedApiClient,
  createSessionApiClient,
  readCsrfCookie,
  sessionRequestOptions,
} from "../../../api/client.ts";
import type { ApiFetch } from "../../../api/proxy.ts";
import {
  decodePendingEngagementAction,
  type PendingEngagementAction,
} from "./post-engagement-pending.ts";
import {
  pendingBodyBytes,
  type PendingSubmissionEnvelopeV1,
} from "../post-composer/pending-submission.ts";

export type CommentReportReason =
  | "spam"
  | "harassment"
  | "hate"
  | "sexual_content"
  | "graphic_content"
  | "misleading"
  | "other";

export type CommentModerationAction = PostModerationCasesCaseRefActionsInput["body"]["action"];
export type CommentModerationCaseDetail = GetCommunitiesCommunityIdModerationCasesCaseRefResponse;
export type CommentModerationResponse = PostModerationCasesCaseRefActionsResponse;
export type PostEngagementApiClientError = PrimaryApiClientError | HappyPathApiClientError;

export function isPostEngagementApiClientError(error: unknown): error is PostEngagementApiClientError {
  return error instanceof PrimaryApiClientError || error instanceof HappyPathApiClientError;
}

export interface PostEngagementTransport {
  createComment(envelope: PendingSubmissionEnvelopeV1): Promise<CreateCommentResponse>;
  createReply(envelope: PendingSubmissionEnvelopeV1): Promise<CreateCommentReplyResponse>;
  reportComment(envelope: PendingSubmissionEnvelopeV1): Promise<ReportCommentResponse>;
  readModerationCase(communityId: string, caseRef: string): Promise<CommentModerationCaseDetail>;
  moderateCase(envelope: PendingSubmissionEnvelopeV1): Promise<CommentModerationResponse>;
  castVote(envelope: PendingSubmissionEnvelopeV1): Promise<CastPostVoteResponse>;
  clearVote(envelope: PendingSubmissionEnvelopeV1): Promise<ClearPostVoteResponse>;
  readSubmission(submissionId: string): Promise<GetTextContentSubmissionResponse>;
}

export interface PostEngagementTransportOptions {
  readonly csrfToken?: () => string | undefined;
  readonly fetchImpl?: ApiFetch;
  readonly origin?: string | URL;
}

export class PostEngagementLocalError extends Error {
  readonly code: "csrf_missing";

  constructor() {
    super("A CSRF token is required for this action");
    this.name = "PostEngagementLocalError";
    this.code = "csrf_missing";
  }
}

function requestOptions(options: PostEngagementTransportOptions) {
  const csrfToken = (options.csrfToken ?? readCsrfCookie)();
  if (!csrfToken) throw new PostEngagementLocalError();
  return sessionRequestOptions(csrfToken);
}

function expectedAction<T extends PendingEngagementAction["kind"]>(
  action: PendingEngagementAction,
  kind: T,
): Extract<PendingEngagementAction, { readonly kind: T }> {
  if (action.kind !== kind) throw new Error(`Pending engagement action must be ${kind}`);
  // SAFETY: the discriminant equality above narrows the closed action union to T.
  return action as Extract<PendingEngagementAction, { readonly kind: T }>;
}

function clientForEnvelope(
  options: PostEngagementTransportOptions,
  envelope: PendingSubmissionEnvelopeV1,
) {
  const body = pendingBodyBytes(envelope);
  const fetchImpl = options.fetchImpl ?? fetch;
  const exactBodyFetch: ApiFetch = (input, init = {}) => fetchImpl(input, {
    ...init,
    // The generated operation still owns URL construction and response/error
    // decoding; this adapter replaces its rebuilt JSON with retained bytes.
    body: body.slice().buffer,
  });
  return createSessionApiClient({ origin: options.origin, fetchImpl: exactBodyFetch });
}

function happyPathClientForEnvelope(
  options: PostEngagementTransportOptions,
  envelope: PendingSubmissionEnvelopeV1,
) {
  const body = pendingBodyBytes(envelope);
  const fetchImpl = options.fetchImpl ?? fetch;
  const exactBodyFetch: ApiFetch = (input, init = {}) => fetchImpl(input, {
    ...init,
    body: body.slice().buffer,
  });
  return createGeneratedApiClient(
    createPirateApiClient,
    { origin: options.origin, fetchImpl: exactBodyFetch },
    { credentials: "same-origin" },
  );
}

function ordinaryClient(options: PostEngagementTransportOptions) {
  return createSessionApiClient({ origin: options.origin, fetchImpl: options.fetchImpl });
}

function ordinaryHappyPathClient(options: PostEngagementTransportOptions) {
  return createGeneratedApiClient(
    createPirateApiClient,
    { origin: options.origin, fetchImpl: options.fetchImpl },
    { credentials: "same-origin" },
  );
}

function personaIdFromEnvelope(envelope: PendingSubmissionEnvelopeV1): string {
  const match = /^principal:([^:]+):post:/u.exec(envelope.pending_request_id);
  if (match?.[1] === undefined) throw new Error("Pending engagement identity is missing");
  return decodeURIComponent(match[1]);
}

/**
 * Generated-client transport for authenticated post engagement. Client and
 * cookie resolution stay lazy so SSR never reads browser state while merely
 * rendering a feed.
 */
export function createPostEngagementTransport(
  options: PostEngagementTransportOptions = {},
): PostEngagementTransport {
  return {
    async createComment(envelope) {
      const action = expectedAction(await decodePendingEngagementAction(envelope), "comment");
      return clientForEnvelope(options, envelope).post_postsPostIdComments({
        path: { postId: action.postId },
        body: { persona_id: personaIdFromEnvelope(envelope), idempotency_key: action.idempotencyKey, body: action.body },
      }, requestOptions(options));
    },
    async createReply(envelope) {
      const action = expectedAction(await decodePendingEngagementAction(envelope), "reply");
      return clientForEnvelope(options, envelope).post_commentsCommentIdReplies({
        path: { commentId: action.commentId },
        body: { persona_id: personaIdFromEnvelope(envelope), idempotency_key: action.idempotencyKey, body: action.body },
      }, requestOptions(options));
    },
    async reportComment(envelope) {
      const action = expectedAction(await decodePendingEngagementAction(envelope), "report");
      return clientForEnvelope(options, envelope).post_commentsCommentIdReports({
        path: { commentId: action.commentId },
        body: { idempotency_key: action.idempotencyKey, reason_code: action.reasonCode },
      }, requestOptions(options));
    },
    readModerationCase(communityId, caseRef) {
      return ordinaryHappyPathClient(options).get_communitiesCommunityIdModerationCasesCaseRef({
        path: { communityId, caseRef },
      }, { credentials: "same-origin" });
    },
    async moderateCase(envelope) {
      const action = expectedAction(await decodePendingEngagementAction(envelope), "moderate");
      return happyPathClientForEnvelope(options, envelope).post_moderationCasesCaseRefActions({
        path: { caseRef: action.caseRef },
        body: {
          version: "moderation-case-action-v2",
          idempotency_key: action.idempotencyKey,
          expected_case_revision: action.expectedCaseRevision,
          action: action.action,
        },
      }, requestOptions(options));
    },
    async castVote(envelope) {
      const action = expectedAction(await decodePendingEngagementAction(envelope), "vote");
      return clientForEnvelope(options, envelope).post_postsPostIdVote({
        path: { postId: action.postId },
        body: { idempotency_key: action.idempotencyKey, value: action.value },
      }, requestOptions(options));
    },
    async clearVote(envelope) {
      const action = expectedAction(await decodePendingEngagementAction(envelope), "clear_vote");
      return clientForEnvelope(options, envelope).post_postsPostIdClearVote({
        path: { postId: action.postId },
        body: { idempotency_key: action.idempotencyKey },
      }, requestOptions(options));
    },
    readSubmission: submissionId => ordinaryClient(options).get_textContentSubmissionsSubmissionId(
      { path: { submissionId } },
      { credentials: "same-origin" },
    ),
  };
}
