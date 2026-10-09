import { pagePoolReadGate } from "./megapot-pool-availability.ts";
import { ApiClientError, type GetCommunitiesCommunityIdPostsPostIdRewardsMegapotPoolResponse, type GetRewardOfferLegsLegIdStandingResponse } from "@pirate/api-client";
import { createPublicApiClient, createSessionApiClient, type PirateApiClient } from "./client.ts";

export type ParticipantPool = NonNullable<GetCommunitiesCommunityIdPostsPostIdRewardsMegapotPoolResponse["pool"]>;
export type ParticipantStanding = GetRewardOfferLegsLegIdStandingResponse["standing"];
export interface ParticipantScope { readonly communityId: string; readonly postId: string }
/** `standing` is null when the server holds no standing for this account in the pool: it has no share. */
export interface ParticipantRewardSnapshot { readonly pool: ParticipantPool; readonly standing: ParticipantStanding | null }
export interface MegapotParticipantData {
  pool(scope: ParticipantScope, signal: AbortSignal): Promise<ParticipantPool | null>;
  standing(scope: ParticipantScope, pool: ParticipantPool, signal: AbortSignal): Promise<ParticipantRewardSnapshot>;
}

/** Public reads never carry the account session. Private standing is neither cached nor persisted. */
export function createMegapotParticipantData(
  publicClient: Pick<PirateApiClient, "get_communitiesCommunityIdPostsPostIdRewardsMegapotPool"> = createPublicApiClient(),
  suppliedSessionClient?: Pick<PirateApiClient, "get_usersMe" | "get_rewardOfferLegsLegIdStanding">,
): MegapotParticipantData {
  const availability = pagePoolReadGate();
  // Cards only read the public pool; the session client is built when standing is first asked for.
  let sessionClient = suppliedSessionClient;
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
      const session = sessionClient ??= createSessionApiClient();
      const before = await session.get_usersMe(undefined, { signal });
      // The route answers 404 for an account that is neither the funder, a community
      // member nor a past share holder of this pool. That is an answer, not a failure:
      // the account has no standing here.
      const standing = await session.get_rewardOfferLegsLegIdStanding({ path: { legId: initial.leg_id } }, { signal }).then(
        result => result.standing,
        (error: unknown) => {
          if (error instanceof ApiClientError && error.status === 404 && error.code === "not_found") return null;
          throw error;
        },
      );
      const current = await pool(scope, signal);
      const after = await session.get_usersMe(undefined, { signal });
      signal.throwIfAborted();
      if (before.id !== after.id) throw new Error("reward_account_changed");
      if (!current || current.leg_id !== initial.leg_id || initial.drawing?.drawing_id !== current.drawing?.drawing_id) {
        throw new Error("reward_drawing_changed");
      }
      if (standing !== null && (standing.leg_id !== current.leg_id
        || standing.drawing_id !== (current.drawing?.drawing_id ?? null)
        || (standing.share_held && !current.drawing))) {
        throw new Error("reward_drawing_changed");
      }
      return { pool: current, standing };
    },
  };
}
