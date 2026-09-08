import type { GetRewardsBonusAssetsResponse, GetRewardsQualificationPoliciesResponse } from "@pirate/api-client";
import type { RewardFundingActor } from "./reward-funding-client.ts";
import { createPublicApiClient, createSessionApiClient, type PirateApiClient } from "./client.ts";
export type RewardAsset = GetRewardsBonusAssetsResponse["items"][number];
export type RewardPolicy = GetRewardsQualificationPoliciesResponse["policies"][number];

export function createRewardSponsorData(client: PirateApiClient = createSessionApiClient(), publicClient: PirateApiClient = createPublicApiClient()) {
  return {
    async catalog() {
      const [me, personas, policies, assets] = await Promise.all([
        client.get_usersMe(undefined), client.get_personas(undefined),
        client.get_rewardsQualificationPolicies(undefined), client.get_rewardsBonusAssets({ query: { limit: "50" } }),
      ]);
      if ((await client.get_usersMe(undefined)).id !== me.id) throw new Error("reward_creation_actor_changed");
      return { accountId: me.id, personas: personas.personas.filter(p => p.status === "active" && p.wallet_set.evm !== null), policies: policies.policies, assets };
    },
    async privateRewards(actor: RewardFundingActor, legId: string | null, cursor?: string) {
      if ((await client.get_usersMe(undefined)).id !== actor.accountId) throw new Error("funding_account_changed");
      const [credits, standing] = await Promise.all([
        client.get_rewardsCredits({ query: { limit: "50", ...(cursor ? { cursor } : {}) } }),
        legId ? client.get_rewardOfferLegsLegIdStanding({ path: { legId } }) : Promise.resolve(null),
      ]);
      if ((await client.get_usersMe(undefined)).id !== actor.accountId) throw new Error("funding_account_changed");
      return { credits, standing: standing?.standing ?? null };
    },
    assets(cursor: string) { return client.get_rewardsBonusAssets({ query: { cursor, limit: "50" } }); },
    async song(communityId: string, postId: string) {
      const path = { communityId, postId };
      const [pool, bonuses] = await Promise.all([
        publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool({ path }),
        publicClient.get_communitiesCommunityIdPostsPostIdRewardsAssetBonuses({ path }),
      ]);
      return { pool: pool.pool, bonuses };
    },
  };
}
