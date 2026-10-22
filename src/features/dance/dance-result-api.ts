import type { GetCommunitiesCommunityIdDanceReviewsReviewIdResultResponse, PirateApiClient } from "@pirate/api-client";
import { createSessionApiClient } from "../../api/client.ts";

export type DanceResult = GetCommunitiesCommunityIdDanceReviewsReviewIdResultResponse;
export interface DanceResultScope { readonly communityId: string; readonly reviewId: string; readonly accountId: string }
export interface DanceResultApi { read(scope: DanceResultScope, signal: AbortSignal): Promise<DanceResult> }

export function assertDanceResult(result: DanceResult, scope: DanceResultScope): void {
  if (result.community_id !== scope.communityId || result.review_id !== scope.reviewId) throw new Error("dance_result_target_mismatch");
  const passed = result.state === "reviewed" && result.verdict === "passed" && result.cue_attestation === "affirmed";
  if ((result.state === "reviewed") !== (result.verdict !== null) || (result.verdict === "passed" && !passed) || (result.qualification_ref !== null && !passed)) throw new Error("dance_result_projection_invalid");
  if ((result.cue_attestation === "affirmed") !== (result.verdict === "passed") || (result.cue_attestation === "not_attested") !== (result.verdict === "not_passed")) throw new Error("dance_result_projection_invalid");
  if ((result.publication_status === "pending" || result.publication_status === "failed") && (!passed || result.show_publicly_if_passed !== true)) throw new Error("dance_result_projection_invalid");
}

export function createDanceResultApi(client?: Pick<PirateApiClient, "get_communitiesCommunityIdDanceReviewsReviewIdResult" | "get_usersMe">): DanceResultApi {
  return {
    async read(scope, signal) {
      const api = client ?? createSessionApiClient();
      const result = await api.get_communitiesCommunityIdDanceReviewsReviewIdResult({ path: { communityId: scope.communityId, reviewId: scope.reviewId } }, { signal });
      const current = await api.get_usersMe(undefined, { signal });
      if (current.id !== scope.accountId) throw new Error("dance_result_session_changed");
      assertDanceResult(result, scope);
      return result;
    },
  };
}

export function danceResultPath(communityId: string, reviewId: string): string {
  return `/dance/${encodeURIComponent(communityId)}/reviews/${encodeURIComponent(reviewId)}`;
}

export function danceResultPresentation(result: DanceResult): { readonly title: string; readonly detail: string } {
  if (result.state === "reviewed") return result.verdict === "passed"
    ? { title: "Passed", detail: result.qualification_ref === null ? "Your dance passed review." : "Your qualifying dance has been recorded." }
    : { title: "Not passed", detail: "You can return to the song to record another attempt." };
  const states = {
    uploaded: { title: "Ready to submit", detail: "This recording has not been submitted for review." },
    screening: { title: "Checking your recording", detail: "Your recording is being checked before review." },
    awaiting_review: { title: "Waiting for review", detail: "There is no review result yet." },
    review_expired: { title: "Not reviewed", detail: "This attempt did not receive a review before its deadline." },
    withdrawn: { title: "Withdrawn", detail: "This attempt was withdrawn." },
    held: { title: "On hold", detail: "This recording is not available for review." },
    expired: { title: "Expired", detail: "This attempt expired before it was submitted." },
    abandoned: { title: "Recording not completed", detail: "This attempt was not completed." },
    processing_failed: { title: "Recording could not be processed", detail: "Return to the song to check whether you can try again." },
  } satisfies Record<Exclude<DanceResult["state"], "reviewed">, { readonly title: string; readonly detail: string }>;
  return states[result.state];
}
