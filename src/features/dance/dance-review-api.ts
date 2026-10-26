import type { PirateApiClient, PostCommunitiesCommunityIdDanceReviewsReviewIdSubmitInput, PostCommunitiesCommunityIdDanceReviewsReviewIdVisibilityInput, PostCommunitiesCommunityIdDanceReviewsReviewIdWithdrawInput } from "@pirate/api-client";
import { captureSessionAuthority, isCurrentSessionAuthority } from "../../api/browser-session-events";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions } from "../../api/client";
import { loadAccountCommunityMemberships } from "../../api/account-community-memberships";
import { projectCommunityJoinAction, type CommunityJoinAction } from "../communities/community-page/community-engagement-api";
import { assertDanceResult, type DanceResult, type DanceResultScope } from "./dance-result-api";

type Client = Pick<PirateApiClient, "get_usersMe" | "get_communitiesCommunityIdDanceReviewsReviewIdResult"
  | "get_usersMeCommunityMemberships" | "get_communitiesCommunityIdJoinEligibility"
  | "get_communitiesCommunityIdDanceModeratedSessionsSessionIdCaptureContext" | "post_communitiesCommunityIdDanceReviewsReviewIdMediaAccess"
  | "post_communitiesCommunityIdDanceReviewsReviewIdSubmit" | "post_communitiesCommunityIdDanceReviewsReviewIdVisibility" | "post_communitiesCommunityIdDanceReviewsReviewIdWithdraw">;
export type DanceReviewCommand = PostCommunitiesCommunityIdDanceReviewsReviewIdSubmitInput["body"]
  | PostCommunitiesCommunityIdDanceReviewsReviewIdVisibilityInput["body"] | PostCommunitiesCommunityIdDanceReviewsReviewIdWithdrawInput["body"];
export type DanceReviewReceipt = Awaited<ReturnType<Client["post_communitiesCommunityIdDanceReviewsReviewIdSubmit"]>>;
export type DanceReviewMedia = Awaited<ReturnType<Client["post_communitiesCommunityIdDanceReviewsReviewIdMediaAccess"]>>;
export class DanceReviewAuthorityError extends Error {}
export type DancePostingEligibility = { readonly kind: "eligible" } | { readonly kind: "unavailable"; readonly join: CommunityJoinAction } | { readonly kind: "unknown" };
export class DancePostingEligibilityError extends Error {
  constructor(readonly eligibility: DancePostingEligibility) { super("dance_posting_unavailable"); }
}
export interface DanceReviewApi {
  postingEligibility(scope: DanceResultScope, signal: AbortSignal): Promise<DancePostingEligibility>;
  read(scope: DanceResultScope, signal: AbortSignal): Promise<DanceResult>;
  disclosure(scope: DanceResultScope, result: DanceResult, signal: AbortSignal): Promise<string>;
  command(scope: DanceResultScope, body: DanceReviewCommand, signal: AbortSignal): Promise<DanceReviewReceipt>;
  media(scope: DanceResultScope, result: DanceResult, signal: AbortSignal): Promise<DanceReviewMedia>;
}

export function assertDanceReviewReceipt(receipt: DanceReviewReceipt, body: DanceReviewCommand, scope: DanceResultScope): void {
  assertDanceResult(receipt.result, scope);
  if (receipt.review_id !== scope.reviewId || receipt.operation !== body.operation
    || (receipt.outcome === "applied") !== (receipt.refusal_code === null)
    || receipt.result.review_revision < body.expected_review_revision) throw new Error("dance_review_receipt_mismatch");
  if (receipt.outcome !== "applied") return;
  const result = receipt.result;
  if (body.operation === "withdraw") {
    if (result.state !== "withdrawn") throw new Error("dance_review_receipt_mismatch");
  } else {
    if (!danceReviewPending(result) || result.show_publicly_if_passed !== body.show_publicly_if_passed) throw new Error("dance_review_receipt_mismatch");
    if (body.operation === "submit" && (result.initial_submit_receipt?.receipt_id !== receipt.receipt_id
      || result.initial_submit_receipt.show_publicly_if_passed !== body.show_publicly_if_passed
      || result.initial_submit_receipt.publication_disclosure_version !== body.publication_disclosure_version)) throw new Error("dance_review_receipt_mismatch");
  }
}

/** Each read/write earns current account authority on both sides. Receipts are
 * historical snapshots, never current UI or private media authorization. */
export function createDanceReviewApi(provided?: Client, csrf: () => string | undefined = readCsrfCookie): DanceReviewApi {
  const authority = captureSessionAuthority();
  const current = (signal: AbortSignal) => { signal.throwIfAborted(); if (!isCurrentSessionAuthority(authority)) throw new DanceReviewAuthorityError("dance_review_session_changed"); };
  const guarded = async <T>(scope: DanceResultScope, signal: AbortSignal, use: (api: Client) => Promise<T>): Promise<T> => {
    scope = { ...scope }; current(signal); const api = provided ?? createSessionApiClient();
    const identity = async () => { current(signal); const user = await api.get_usersMe(undefined, { signal }); current(signal); if (user.id !== scope.accountId) throw new DanceReviewAuthorityError("dance_review_account_changed"); };
    await identity(); current(signal); const result = await use(api); current(signal); await identity(); current(signal); return result;
  };
  const write = (signal: AbortSignal) => { current(signal); const token = csrf(); current(signal); if (!token) throw new Error("dance_review_csrf_unavailable"); return sessionRequestOptions(token, { signal }); };
  return {
    async postingEligibility(scope, signal) {
      scope = { ...scope };
      return guarded(scope, signal, async api => {
        const memberships = await loadAccountCommunityMemberships({ client: {
          get_usersMeCommunityMemberships: input => { current(signal); return api.get_usersMeCommunityMemberships(input, { signal }); },
        } });
        current(signal);
        if (memberships.some(item => item.community_id === scope.communityId)) return { kind: "eligible" };
        const eligibility = await api.get_communitiesCommunityIdJoinEligibility({ path: { communityId: scope.communityId } }, { signal });
        current(signal);
        return { kind: "unavailable", join: projectCommunityJoinAction(eligibility, scope.communityId) };
      });
    },
    async read(scope, signal) {
      scope = { ...scope };
      const result = await guarded(scope, signal, api => api.get_communitiesCommunityIdDanceReviewsReviewIdResult({ path: { communityId: scope.communityId, reviewId: scope.reviewId } }, { signal }));
      assertDanceResult(result, scope); return result;
    },
    async disclosure(scope, result, signal) {
      scope = { ...scope }; assertDanceResult(result, scope);
      const context = await guarded(scope, signal, api => api.get_communitiesCommunityIdDanceModeratedSessionsSessionIdCaptureContext({ path: { communityId: scope.communityId, sessionId: result.session_id } }, { signal }));
      const session = context.session, policy = context.captured_policy;
      if (session.review_id !== result.review_id || session.session_id !== result.session_id || session.attempt_id !== result.attempt_id
        || session.community_id !== scope.communityId || session.song_post_id !== result.song_post_id || session.terms_hash !== result.session_terms_hash
        || session.choreography_id !== result.choreography_id || session.choreography_revision !== result.choreography_revision
        || context.audio_revision !== result.audio_revision || context.segment_id !== result.segment_id
        || policy.qualification_policy_version_id !== result.qualification_policy_version || policy.qualification_policy_hash !== result.qualification_policy_hash
        || policy.rubric_version !== result.captured_policy.rubric_version || policy.rubric_hash !== result.captured_policy.rubric_hash
        || session.retention_hash !== result.captured_policy.retention_hash || session.safety_hash !== result.captured_policy.safety_hash) throw new Error("dance_review_target_changed");
      return policy.publication_disclosure_version;
    },
    async command(scope, body, signal) {
      scope = { ...scope }; body = { ...body };
      if (body.community_id !== scope.communityId || body.review_id !== scope.reviewId) throw new Error("dance_review_target_changed");
      const command = body, path = { communityId: scope.communityId, reviewId: scope.reviewId };
      const receipt = await guarded(scope, signal, api => {
        switch (command.operation) {
          case "submit": return api.post_communitiesCommunityIdDanceReviewsReviewIdSubmit({ path, body: command }, write(signal));
          case "visibility": return api.post_communitiesCommunityIdDanceReviewsReviewIdVisibility({ path, body: command }, write(signal));
          case "withdraw": return api.post_communitiesCommunityIdDanceReviewsReviewIdWithdraw({ path, body: command }, write(signal));
        }
      });
      assertDanceReviewReceipt(receipt, command, scope);
      return receipt;
    },
    async media(scope, result, signal) {
      scope = { ...scope }; assertDanceResult(result, scope);
      const grant = await guarded(scope, signal, api => api.post_communitiesCommunityIdDanceReviewsReviewIdMediaAccess({ path: { communityId: scope.communityId, reviewId: scope.reviewId },
        body: { version: "dance-private-media-access-v1", expected_review_revision: result.review_revision, audience: "dancer" } }, write(signal)));
      const expected = `/api/communities/${encodeURIComponent(scope.communityId)}/dance/reviews/${encodeURIComponent(scope.reviewId)}/media/${encodeURIComponent(grant.lease_id)}`;
      if (grant.url !== expected || !Number.isSafeInteger(grant.expires_at_ms) || grant.expires_at_ms <= Date.now()) throw new Error("dance_review_media_unavailable");
      return grant;
    },
  };
}

export const danceReviewPath = (communityId: string, reviewId: string) => `/dance/${encodeURIComponent(communityId)}/reviews/${encodeURIComponent(reviewId)}/recording`;
export const danceReviewPending = (result: DanceResult) => result.state === "screening" || result.state === "awaiting_review";
export const danceReviewEditable = (result: DanceResult) => result.state === "uploaded" || danceReviewPending(result);
