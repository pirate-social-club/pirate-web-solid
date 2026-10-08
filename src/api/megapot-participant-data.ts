import { pagePoolReadGate } from "./megapot-pool-availability.ts";
import type { GetCommunitiesCommunityIdPostsPostIdRewardsMegapotPoolResponse, GetRewardOfferLegsLegIdStandingResponse } from "@pirate/api-client";
import { createPublicApiClient, createSessionApiClient, type PirateApiClient } from "./client.ts";

export type ParticipantPool = NonNullable<GetCommunitiesCommunityIdPostsPostIdRewardsMegapotPoolResponse["pool"]>;
export type ParticipantStanding = GetRewardOfferLegsLegIdStandingResponse["standing"];
export interface ParticipantScope { readonly communityId: string; readonly postId: string }
export interface ParticipantRewardSnapshot { readonly pool: ParticipantPool; readonly standing: ParticipantStanding }
export interface MegapotParticipantData {
  pool(scope: ParticipantScope, signal: AbortSignal): Promise<ParticipantPool | null>;
  standing(scope: ParticipantScope, pool: ParticipantPool, signal: AbortSignal): Promise<ParticipantRewardSnapshot>;
}

/** Public reads never carry the account session. Private standing is neither cached nor persisted. */
export function createMegapotParticipantData(
  publicClient: Pick<PirateApiClient, "get_communitiesCommunityIdPostsPostIdRewardsMegapotPool"> = createPublicApiClient(),
  sessionClient: Pick<PirateApiClient, "get_usersMe" | "get_rewardOfferLegsLegIdStanding"> = createSessionApiClient(),
): MegapotParticipantData {
  const availability = pagePoolReadGate();
  const pool = async (scope: ParticipantScope, signal: AbortSignal) => {
    const result = await availability.read(
      () => publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool({ path: scope }, { signal }), signal,
    );
    signal.throwIfAborted();
    if (result.pool && (result.pool.community_id !== scope.communityId || result.pool.post_id !== scope.postId)) {
      throw new Error("reward_song_changed");
    }
    return result.pool;
  };
  return {
    pool,
    async standing(scope, initial, signal) {
      const before = await sessionClient.get_usersMe(undefined, { signal });
      const { standing } = await sessionClient.get_rewardOfferLegsLegIdStanding({ path: { legId: initial.leg_id } }, { signal });
      const current = await pool(scope, signal);
      const after = await sessionClient.get_usersMe(undefined, { signal });
      signal.throwIfAborted();
      if (before.id !== after.id) throw new Error("reward_account_changed");
      if (!current || current.leg_id !== initial.leg_id || standing.leg_id !== current.leg_id
        || initial.drawing?.drawing_id !== current.drawing?.drawing_id
        || standing.drawing_id !== (current.drawing?.drawing_id ?? null)
        || (standing.share_held && !current.drawing)) {
        throw new Error("reward_drawing_changed");
      }
      return { pool: current, standing };
    },
  };
}
