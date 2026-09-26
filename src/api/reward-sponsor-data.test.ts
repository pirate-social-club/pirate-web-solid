import { describe, expect, it } from "vitest";
import type {
  GetCommunitiesCommunityIdPostsPostIdOwnerPolicyResponse,
  GetCommunitiesCommunityIdPostsPostIdRewardsAssetBonusesResponse,
  GetCommunitiesCommunityIdPostsPostIdRewardsMegapotPoolResponse,
} from "@pirate/api-client";
import { composeSponsorContext } from "./reward-sponsor-data.ts";
type MegapotPool = NonNullable<GetCommunitiesCommunityIdPostsPostIdRewardsMegapotPoolResponse["pool"]>;
type Bonus = GetCommunitiesCommunityIdPostsPostIdRewardsAssetBonusesResponse["items"][number];
const policy = (overrides: Partial<GetCommunitiesCommunityIdPostsPostIdOwnerPolicyResponse> = {}): GetCommunitiesCommunityIdPostsPostIdOwnerPolicyResponse => ({
  object: "song_owner_policy", community_id: "community", post_id: "song", audio_revision: 1,
  owner_account_id: "account", policy_revision: 1, third_party_reward_legs: "allowed", pool_leg: "allowed",
  derivative_video: "allowed", policy_hash: "a".repeat(64), effective_at: "2026-09-16T00:00:00Z", ...overrides,
});
const pool = (overrides: Partial<MegapotPool> = {}): MegapotPool => ({
  object: "song_megapot_pool_projection", offer_id: "offer", leg_id: "leg", community_id: "community", post_id: "song",
  offer_status: "active", leg_status: "active", chain_id: 84532, token_address: `0x${"1".repeat(40)}`, token_decimals: 6,
  funded_atomic: "1", available_budget_atomic: "1", max_ticket_price_atomic: "1", entry_cutoff_seconds: 60,
  eligible_activities: ["study"], min_score_bps: 7000, empty_pool_policy: "no_purchase", qualification_policies: null,
  allocation_rule: "equal_v1", ticket_custody: "pirate", winnings_basis: "net_of_referral_win_share", fallback_disclosure: null, drawing: null, ...overrides,
});
const bonus = (overrides: Partial<Bonus> = {}): Bonus => ({
  object: "song_asset_bonus_projection", offer_id: "offer", leg_id: "leg", community_id: "community", post_id: "song",
  offer_status: "active", leg_status: "active", chain_id: 84532, token_address: `0x${"2".repeat(40)}`, token_decimals: 6,
  token_symbol: "PSTB", asset_policy_version: "v1", amount_per_claim_atomic: "1", max_claims: 1, claimed_count: 0,
  available_inventory_atomic: "1", viewer_state: null, viewer_credit_id: null, viewer_credit_state: null, qualification_policies: null, ...overrides,
});
describe("composed sponsor context", () => {
  it("keeps owner permissions and derives the existing offer from the public pool", () => {
    const context = composeSponsorContext(policy(), pool(), []);
    expect(context.offer).toEqual({ offer_id: "offer" });
    expect(context.permissions.add_asset_bonus).toEqual({ allowed: true, reason: null });
    expect(context.permissions.add_megapot_pool).toEqual({ allowed: true, reason: null });
  });
  it("blocks a declined pool leg without blocking the asset bonus", () => {
    const context = composeSponsorContext(policy({ pool_leg: "declined" }), null, []);
    expect(context.permissions.add_megapot_pool).toEqual({ allowed: false, reason: "pool_declined" });
    expect(context.permissions.add_asset_bonus).toEqual({ allowed: true, reason: null });
  });
  it("keeps an unreadable policy unconfirmed instead of inventing permission", () => {
    const context = composeSponsorContext(null, pool(), []);
    expect(context.offer).toEqual({ offer_id: "offer" });
    expect(context.permissions.add_asset_bonus).toEqual({ allowed: "unconfirmed", reason: null });
    expect(context.permissions.add_megapot_pool).toEqual({ allowed: "unconfirmed", reason: null });
  });
  it.each(["exhausted", "expired", "ended"] as const)("allows a new offer after a %s offer", status => {
    const context = composeSponsorContext(policy(), pool({ offer_status: status }), []);
    expect(context.offer).toBeNull();
    expect(context.permissions.add_asset_bonus).toEqual({ allowed: true, reason: null });
    expect(context.permissions.add_megapot_pool).toEqual({ allowed: true, reason: null });
  });
  it.each(["paused", "operational_hold"] as const)("blocks a new offer while the old offer is %s", status => {
    const context = composeSponsorContext(policy(), pool({ offer_status: status }), []);
    expect(context.offer).toBeNull();
    expect(context.permissions.add_asset_bonus).toEqual({ allowed: false, reason: "offer_not_addable" });
    expect(context.permissions.add_megapot_pool).toEqual({ allowed: false, reason: "offer_not_addable" });
  });
  it("joins a newer addable asset offer instead of a terminal pool offer", () => {
    const context = composeSponsorContext(policy(), pool({ offer_id: "terminal-pool", offer_status: "exhausted" }), [
      bonus({ offer_id: "newer-asset", offer_status: "active" }),
    ]);
    expect(context.offer).toEqual({ offer_id: "newer-asset" });
    expect(context.permissions.add_asset_bonus).toEqual({ allowed: true, reason: null });
    expect(context.permissions.add_megapot_pool).toEqual({ allowed: true, reason: null });
  });
  it("selects the addable asset offer among multiple visible asset legs", () => {
    const context = composeSponsorContext(policy(), null, [
      bonus({ offer_id: "ended-asset", offer_status: "ended" }),
      bonus({ offer_id: "active-asset", offer_status: "active" }),
    ]);
    expect(context.offer).toEqual({ offer_id: "active-asset" });
  });
  it("discovers the existing offer from an asset bonus when no pool exists", () => {
    const context = composeSponsorContext(null, null, [bonus()]);
    expect(context.offer).toEqual({ offer_id: "offer" });
  });
  it("creates a new offer when no leg projection exists", () => {
    const context = composeSponsorContext(policy(), null, []);
    expect(context.offer).toBeNull();
  });
});
