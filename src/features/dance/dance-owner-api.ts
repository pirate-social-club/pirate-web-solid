import type { GetCommunitiesCommunityIdDanceOwnerReviewsResponse, GetCommunitiesCommunityIdDanceOwnerReviewsReviewIdResponse, GetCommunitiesCommunityIdDanceOwnerReviewsReviewIdRubricResponse, PirateApiClient, PostCommunitiesCommunityIdDanceReviewsReviewIdVerdictInput } from "@pirate/api-client";
import { captureSessionAuthority, isCurrentSessionAuthority } from "../../api/browser-session-events";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions } from "../../api/client";
import { assertDanceResult, type DanceResultScope } from "./dance-result-api";
import type { DanceReviewMedia, DanceReviewReceipt } from "./dance-review-api";

export type DanceOwnerScope = Pick<DanceResultScope, "accountId" | "communityId">;
export type DanceOwnerQueue = GetCommunitiesCommunityIdDanceOwnerReviewsResponse;
export type DanceOwnerDetail = GetCommunitiesCommunityIdDanceOwnerReviewsReviewIdResponse;
export type DanceOwnerRubric = GetCommunitiesCommunityIdDanceOwnerReviewsReviewIdRubricResponse;
export interface DanceOwnerRecording { readonly detail: DanceOwnerDetail; readonly rubric: DanceOwnerRubric }
export type DanceOwnerVerdict = PostCommunitiesCommunityIdDanceReviewsReviewIdVerdictInput["body"];
export interface DanceOwnerApi {
  queue(scope: DanceOwnerScope, cursor: string | null, signal: AbortSignal): Promise<DanceOwnerQueue>;
  detail(scope: DanceResultScope, signal: AbortSignal): Promise<DanceOwnerRecording>;
  verdict(scope: DanceResultScope, body: DanceOwnerVerdict, signal: AbortSignal): Promise<DanceReviewReceipt>;
  media(scope: DanceResultScope, recording: DanceOwnerRecording, signal: AbortSignal): Promise<DanceReviewMedia>;
}
type Client = Pick<PirateApiClient, "get_usersMe" | "get_communitiesCommunityIdDanceOwnerReviews" | "get_communitiesCommunityIdDanceOwnerReviewsReviewId"
  | "get_communitiesCommunityIdDanceOwnerReviewsReviewIdRubric" | "post_communitiesCommunityIdDanceReviewsReviewIdVerdict" | "post_communitiesCommunityIdDanceReviewsReviewIdMediaAccess">;

export function assertDanceOwnerRecording(value: DanceOwnerRecording, scope: DanceResultScope): void {
  const { detail, rubric } = value, review = detail.review;
  if (review.community_id !== scope.communityId || review.review_id !== scope.reviewId || review.state !== "awaiting_review"
    || rubric.community_id !== scope.communityId || rubric.review_id !== scope.reviewId || rubric.review_revision !== review.review_revision
    || rubric.rubric_hash !== detail.rubric_hash || rubric.rubric_version !== detail.rubric_version
    || detail.attestation_version !== "dance-owner-verdict-attestation-v1" || rubric.attestation_version !== detail.attestation_version
    || !rubric.rubric_text.trim() || !Number.isFinite(Date.parse(review.review_deadline))) throw new Error("dance_owner_target_changed");
}
export function assertDanceOwnerReceipt(receipt: DanceReviewReceipt, body: DanceOwnerVerdict, scope: DanceResultScope): void {
  assertDanceResult(receipt.result, scope);
  if (body.community_id !== scope.communityId || body.review_id !== scope.reviewId || receipt.review_id !== scope.reviewId || receipt.operation !== "verdict"
    || (receipt.outcome === "applied") !== (receipt.refusal_code === null) || receipt.result.review_revision < body.expected_review_revision
    || (receipt.outcome === "applied" && (receipt.result.state !== "reviewed" || receipt.result.verdict !== body.verdict
      || receipt.result.review_revision <= body.expected_review_revision))) throw new Error("dance_owner_receipt_mismatch");
}

/** The server authorizes the current owner, distinct from the dancer, at every
 * read/media/commit. Browser account fences cannot replace those checks. */
export function createDanceOwnerApi(provided?: Client, csrf: () => string | undefined = readCsrfCookie): DanceOwnerApi {
  const authority = captureSessionAuthority();
  const current = (signal: AbortSignal) => { signal.throwIfAborted(); if (!isCurrentSessionAuthority(authority)) throw new Error("dance_owner_session_changed"); };
  const guarded = async <T>(scope: DanceOwnerScope, signal: AbortSignal, use: (api: Client) => Promise<T>): Promise<T> => {
    scope = { ...scope }; current(signal); const api = provided ?? createSessionApiClient();
    const identity = async () => { current(signal); const user = await api.get_usersMe(undefined, { signal }); current(signal); if (user.id !== scope.accountId) throw new Error("dance_owner_account_changed"); };
    await identity(); current(signal); const result = await use(api); current(signal); await identity(); current(signal); return result;
  };
  const write = (signal: AbortSignal) => { current(signal); const token = csrf(); current(signal); if (!token) throw new Error("dance_owner_csrf_unavailable"); return sessionRequestOptions(token, { signal }); };
  return {
    async queue(scope, cursor, signal) {
      scope = { ...scope };
      const page = await guarded(scope, signal, api => api.get_communitiesCommunityIdDanceOwnerReviews({ path: { communityId: scope.communityId }, query: cursor ? { cursor } : {} }, { signal }));
      if (page.items.some(item => item.community_id !== scope.communityId || item.state !== "awaiting_review")) throw new Error("dance_owner_target_changed");
      return page;
    },
    async detail(scope, signal) {
      scope = { ...scope }; const path = { communityId: scope.communityId, reviewId: scope.reviewId };
      const value = await guarded(scope, signal, async api => {
        const detail = await api.get_communitiesCommunityIdDanceOwnerReviewsReviewId({ path }, { signal }); current(signal);
        const rubric = await api.get_communitiesCommunityIdDanceOwnerReviewsReviewIdRubric({ path }, { signal }); return { detail, rubric };
      });
      assertDanceOwnerRecording(value, scope); return value;
    },
    async verdict(scope, body, signal) {
      scope = { ...scope }; body = { ...body };
      if (body.community_id !== scope.communityId || body.review_id !== scope.reviewId) throw new Error("dance_owner_target_changed");
      const receipt = await guarded(scope, signal, api => api.post_communitiesCommunityIdDanceReviewsReviewIdVerdict({ path: { communityId: scope.communityId, reviewId: scope.reviewId }, body }, write(signal)));
      assertDanceOwnerReceipt(receipt, body, scope); return receipt;
    },
    async media(scope, recording, signal) {
      scope = { ...scope }; assertDanceOwnerRecording(recording, scope);
      const grant = await guarded(scope, signal, api => api.post_communitiesCommunityIdDanceReviewsReviewIdMediaAccess({ path: { communityId: scope.communityId, reviewId: scope.reviewId },
        body: { version: "dance-private-media-access-v1", expected_review_revision: recording.detail.review.review_revision, audience: "owner" } }, write(signal)));
      if (grant.url !== danceOwnerMediaPath(scope, grant.lease_id) || !Number.isSafeInteger(grant.expires_at_ms) || grant.expires_at_ms <= Date.now()) throw new Error("dance_owner_media_unavailable");
      return grant;
    },
  };
}
export const danceOwnerMediaPath = (scope: DanceResultScope, leaseId: string) => `/api/communities/${encodeURIComponent(scope.communityId)}/dance/reviews/${encodeURIComponent(scope.reviewId)}/media/${encodeURIComponent(leaseId)}`;
