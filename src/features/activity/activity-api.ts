import type { GetSongActivityLeaderboardResponse, PirateApiClient } from "@pirate/api-client";
import { createPublicApiClient, createSessionApiClient, readCsrfCookie, sessionRequestOptions } from "../../api/client.ts";

export type ActivityLeaderboardData = GetSongActivityLeaderboardResponse;
export interface ActivityScope { readonly communityId: string; readonly postId?: string }
export type ActivityClient = Pick<PirateApiClient,
  "get_communitiesCommunityIdPostsPostIdRewardsLeaderboard" |
  "get_communitiesCommunityIdRewardsLeaderboard" |
  "get_rewardsQualificationPolicies" |
  "put_communitiesCommunityIdRewardsPresentationPersona">;

/** These reads do not depend on financial feature availability. */
export async function readActivityLeaderboard(scope: ActivityScope, authenticated: boolean, signal: AbortSignal, client?: ActivityClient): Promise<ActivityLeaderboardData> {
  const api = client ?? (authenticated ? createSessionApiClient() : createPublicApiClient());
  const result = scope.postId
    ? await api.get_communitiesCommunityIdPostsPostIdRewardsLeaderboard({ path: { communityId: scope.communityId, postId: scope.postId } }, { signal })
    : await api.get_communitiesCommunityIdRewardsLeaderboard({ path: { communityId: scope.communityId } }, { signal });
  if (result.scope.community_id !== scope.communityId || (scope.postId
    ? result.scope.kind !== "song" || result.scope.post_id !== scope.postId
    : result.scope.kind !== "community")) throw new Error("activity_scope_mismatch");
  return result;
}

export async function setActivityPresentation(scope: ActivityScope, personaId: string, idempotencyKey: string, signal: AbortSignal, client?: ActivityClient) {
  const csrf = readCsrfCookie();
  if (!csrf) throw new Error("activity_csrf_unavailable");
  return (client ?? createSessionApiClient()).put_communitiesCommunityIdRewardsPresentationPersona({
    path: { communityId: scope.communityId }, body: { persona_id: personaId, idempotency_key: idempotencyKey },
  }, sessionRequestOptions(csrf, { signal }));
}
