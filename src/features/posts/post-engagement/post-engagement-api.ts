import {
  type ClearPostVoteResponse,
  type CreateCommentReplyResponse,
  type CreateCommentResponse,
  type ModerateCaseActionResponse,
  type PirateApiClient,
  type ReportCommentResponse,
  type CastPostVoteResponse,
} from "@pirate/api-client";

import {
  createSessionApiClient,
  readCsrfCookie,
  sessionRequestOptions,
} from "../../../api/client.ts";

export type CommentReportReason =
  | "spam"
  | "harassment"
  | "hate"
  | "sexual_content"
  | "graphic_content"
  | "misleading"
  | "other";

export type CommentModerationAction =
  | "approve"
  | "dismiss"
  | "hide"
  | "remove"
  | "restore";

export interface PostEngagementTransport {
  createComment(postId: string, body: string, idempotencyKey: string): Promise<CreateCommentResponse>;
  createReply(commentId: string, body: string, idempotencyKey: string): Promise<CreateCommentReplyResponse>;
  reportComment(commentId: string, reasonCode: CommentReportReason, idempotencyKey: string): Promise<ReportCommentResponse>;
  moderateCase(caseRef: string, action: CommentModerationAction, idempotencyKey: string): Promise<ModerateCaseActionResponse>;
  castVote(postId: string, value: -1 | 1, idempotencyKey: string): Promise<CastPostVoteResponse>;
  clearVote(postId: string, idempotencyKey: string): Promise<ClearPostVoteResponse>;
}

export type PostEngagementClient = Pick<
  PirateApiClient,
  | "post_postsPostIdComments"
  | "post_commentsCommentIdReplies"
  | "post_commentsCommentIdReports"
  | "post_moderationCasesCaseRefActions"
  | "post_postsPostIdVote"
  | "post_postsPostIdClearVote"
>;

export interface PostEngagementTransportOptions {
  readonly client?: PostEngagementClient;
  readonly csrfToken?: () => string | undefined;
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

/**
 * Generated-client transport for authenticated post engagement. Client and
 * cookie resolution stay lazy so SSR never reads browser state while merely
 * rendering a feed.
 */
export function createPostEngagementTransport(
  options: PostEngagementTransportOptions = {},
): PostEngagementTransport {
  const client = () => options.client ?? createSessionApiClient();
  return {
    createComment: async (postId, body, idempotencyKey) => client().post_postsPostIdComments({
      path: { postId },
      body: { idempotency_key: idempotencyKey, body },
    }, requestOptions(options)),
    createReply: async (commentId, body, idempotencyKey) => client().post_commentsCommentIdReplies({
      path: { commentId },
      body: { idempotency_key: idempotencyKey, body },
    }, requestOptions(options)),
    reportComment: async (commentId, reasonCode, idempotencyKey) => client().post_commentsCommentIdReports({
      path: { commentId },
      body: { idempotency_key: idempotencyKey, reason_code: reasonCode },
    }, requestOptions(options)),
    moderateCase: async (caseRef, action, idempotencyKey) => client().post_moderationCasesCaseRefActions({
      path: { caseRef },
      body: { idempotency_key: idempotencyKey, action },
    }, requestOptions(options)),
    castVote: async (postId, value, idempotencyKey) => client().post_postsPostIdVote({
      path: { postId },
      body: { idempotency_key: idempotencyKey, value },
    }, requestOptions(options)),
    clearVote: async (postId, idempotencyKey) => client().post_postsPostIdClearVote({
      path: { postId },
      body: { idempotency_key: idempotencyKey },
    }, requestOptions(options)),
  };
}
