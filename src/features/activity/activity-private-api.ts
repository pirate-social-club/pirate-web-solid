import type { GetStudyCompletionStateResponse, GetCommunitiesCommunityIdPostsPostIdRewardsProgressResponse, GetCommunitiesCommunityIdRewardsPresentationPersonaResponse, PirateApiClient } from "@pirate/api-client";
import { createSessionApiClient } from "../../api/client.ts";
import type { ActivityScope } from "./activity-api.ts";

export type ActivityProgressData = GetCommunitiesCommunityIdPostsPostIdRewardsProgressResponse;
export type ActivityPresentationData = GetCommunitiesCommunityIdRewardsPresentationPersonaResponse;
export type ActivityCompletionData = GetStudyCompletionStateResponse;
export type ActivityAttempt = ActivityCompletionData["attempt"];
export type PrivateActivityClient = Pick<PirateApiClient, "get_communitiesCommunityIdPostsPostIdRewardsProgress" | "get_communitiesCommunityIdRewardsProgress" | "get_communitiesCommunityIdRewardsPresentationPersona">;
export type CompletionClient = Pick<PirateApiClient, "get_communitiesCommunityIdStudyV2SessionsSessionIdCompletion" | "get_communitiesCommunityIdKaraokeSessionsSessionIdAttemptsAttemptIdCompletion">;
export interface CompletionTarget { readonly communityId: string; readonly postId: string; readonly personaId: string; readonly attempt: ActivityAttempt }

export async function readPrivateProgress(scope: ActivityScope, signal: AbortSignal, client: PrivateActivityClient = createSessionApiClient()): Promise<ActivityProgressData> {
  const value = scope.postId
    ? await client.get_communitiesCommunityIdPostsPostIdRewardsProgress({ path: { communityId: scope.communityId, postId: scope.postId } }, { signal })
    : await client.get_communitiesCommunityIdRewardsProgress({ path: { communityId: scope.communityId } }, { signal });
  if (value.scope.community_id !== scope.communityId || (scope.postId
    ? value.scope.kind !== "song" || value.scope.post_id !== scope.postId : value.scope.kind !== "community")) throw new Error("activity_progress_scope_mismatch");
  return value;
}

export async function readPresentation(scope: ActivityScope, signal: AbortSignal, client: PrivateActivityClient = createSessionApiClient()): Promise<ActivityPresentationData> {
  const value = await client.get_communitiesCommunityIdRewardsPresentationPersona({ path: { communityId: scope.communityId } }, { signal });
  if (value.community_id !== scope.communityId || (value.selection.status === "selected" && value.selection.presentation.community_id !== scope.communityId)) throw new Error("activity_presentation_scope_mismatch");
  return value;
}

export function matchesCompletion(value: ActivityCompletionData, target: CompletionTarget): boolean {
  return value.community_id === target.communityId && value.post_id === target.postId && value.persona_id === target.personaId
    && value.attempt.kind === target.attempt.kind && value.attempt.session_id === target.attempt.session_id
    && (target.attempt.kind !== "karaoke" || (value.attempt.kind === "karaoke" && value.attempt.attempt_id === target.attempt.attempt_id));
}

export async function readCompletion(target: CompletionTarget, signal: AbortSignal, client: CompletionClient = createSessionApiClient()): Promise<ActivityCompletionData> {
  const value = target.attempt.kind === "study"
    ? await client.get_communitiesCommunityIdStudyV2SessionsSessionIdCompletion({ path: { communityId: target.communityId, sessionId: target.attempt.session_id } }, { signal })
    : await client.get_communitiesCommunityIdKaraokeSessionsSessionIdAttemptsAttemptIdCompletion({ path: { communityId: target.communityId, sessionId: target.attempt.session_id, attemptId: target.attempt.attempt_id } }, { signal });
  if (!matchesCompletion(value, target)) throw new Error("activity_completion_identity_mismatch");
  return value;
}
