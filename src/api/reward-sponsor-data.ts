import type {
  GetCommunitiesCommunityIdPostsPostIdOwnerPolicyResponse,
  GetCommunitiesCommunityIdPostsPostIdRewardsAssetBonusesResponse,
  GetCommunitiesCommunityIdPostsPostIdRewardsMegapotPoolResponse,
  GetRewardsBonusAssetsResponse,
  GetRewardsQualificationPoliciesResponse,
} from "@pirate/api-client";
import type { RewardFundingActor } from "./reward-funding-client.ts";
import { createPublicApiClient, createSessionApiClient, type PirateApiClient } from "./client.ts";
export type RewardAsset = GetRewardsBonusAssetsResponse["items"][number];
export type RewardPolicy = GetRewardsQualificationPoliciesResponse["policies"][number];
export type RewardPermission =
  | Readonly<{ allowed: true; reason: null }>
  | Readonly<{ allowed: false; reason: "owner_only" | "pool_declined" | "offer_not_addable" }>
  | Readonly<{ allowed: "unconfirmed"; reason: null }>;
export interface RewardSponsorContext {
  readonly offer: Readonly<{ offer_id: string }> | null;
  readonly permissions: Readonly<{ add_asset_bonus: RewardPermission; add_megapot_pool: RewardPermission }>;
}
type OwnerPolicy = GetCommunitiesCommunityIdPostsPostIdOwnerPolicyResponse;
type MegapotPool = GetCommunitiesCommunityIdPostsPostIdRewardsMegapotPoolResponse["pool"];
type AssetBonuses = GetCommunitiesCommunityIdPostsPostIdRewardsAssetBonusesResponse["items"];
const addableOfferStatuses = new Set(["draft", "active"]);
const terminalOfferStatuses = new Set(["exhausted", "expired", "ended"]);

/** The 0.69.0 sponsor-context read is not part of the current contracts. Permission
 * is composed from the owner-scoped policy read, and existing-offer identity from
 * the public leg projections. An unreadable policy stays unconfirmed rather than
 * fabricated, and the server remains the authority at offer and leg creation. */
export function composeSponsorContext(policy: OwnerPolicy | null, pool: MegapotPool, bonuses: AssetBonuses): RewardSponsorContext {
  // The server admits one non-terminal offer per post, so an addable leg of
  // either kind identifies the single offer a new leg may join. The pool
  // projection ranks a newer addable offer above an older terminal one and a
  // terminal leg of one kind never masks an addable leg of the other kind.
  const candidates = [
    ...(pool === null ? [] : [{ offer_id: pool.offer_id, offer_status: pool.offer_status }]),
    ...bonuses.map(bonus => ({ offer_id: bonus.offer_id, offer_status: bonus.offer_status })),
  ];
  const addable = candidates.find(candidate => addableOfferStatuses.has(candidate.offer_status));
  const offerNotAddable: RewardPermission = { allowed: false, reason: "offer_not_addable" };
  const unconfirmed: RewardPermission = { allowed: "unconfirmed", reason: null };
  const allowed: RewardPermission = { allowed: true, reason: null };
  // A terminal offer is history: the server permits a new offer once the
  // prior one ends. A paused or unknown nonterminal offer still blocks here.
  const blocked = addable === undefined && candidates.some(candidate => !terminalOfferStatuses.has(candidate.offer_status));
  const permission = (base: RewardPermission): RewardPermission => blocked ? offerNotAddable : base;
  return {
    offer: addable === undefined ? null : { offer_id: addable.offer_id },
    permissions: policy === null
      ? { add_asset_bonus: permission(unconfirmed), add_megapot_pool: permission(unconfirmed) }
      : {
          add_asset_bonus: permission(allowed),
          add_megapot_pool: permission(policy.pool_leg === "declined" ? { allowed: false, reason: "pool_declined" } : allowed),
        },
  };
}

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
    async sponsorContext(actor: RewardFundingActor, communityId: string, postId: string) {
      if ((await client.get_usersMe(undefined)).id !== actor.accountId) {
        throw new Error("reward_creation_actor_changed");
      }
      const path = { communityId, postId };
      const [policy, pool, bonuses] = await Promise.all([
        client.get_communitiesCommunityIdPostsPostIdOwnerPolicy({ path, query: { persona_id: actor.personaId } }).catch(() => null),
        publicClient.get_communitiesCommunityIdPostsPostIdRewardsMegapotPool({ path }),
        publicClient.get_communitiesCommunityIdPostsPostIdRewardsAssetBonuses({ path }),
      ]);
      if ((await client.get_usersMe(undefined)).id !== actor.accountId) {
        throw new Error("reward_creation_actor_changed");
      }
      return composeSponsorContext(policy, pool.pool, bonuses.items);
    },
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
