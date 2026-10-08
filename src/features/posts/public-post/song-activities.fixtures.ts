import type { SongActivityRewards } from "./song-activities-rewards.ts";

/** API-shaped public projections shared by review stories and reward boundary tests. */
export const activityRewardsFixture: SongActivityRewards = {
  pool: {
    object: "song_megapot_pool_projection", offer_id: "offer", leg_id: "pool", community_id: "community-story", post_id: "post-1",
    offer_status: "active", leg_status: "active", chain_id: 84532, token_address: "0x0000000000000000000000000000000000000001", token_decimals: 6,
    funded_atomic: "10000000", available_budget_atomic: "10000000", max_ticket_price_atomic: "1000000", entry_cutoff_seconds: 600,
    eligible_activities: ["karaoke"], min_score_bps: 8000, empty_pool_policy: "no_purchase",
    qualification_policies: [{ activity: "karaoke", policy: { kind: "karaoke_qualification_v2", qualification_policy_version_id: "sing-v2", minimum_scored_line_count: 5, minimum_coverage_bps: 8500, minimum_final_score_bps: 7000, eligible_playback_kinds: ["full_mix", "instrumental"] } }],
    allocation_rule: "equal_v1", ticket_custody: "pirate", winnings_basis: "net_of_referral_win_share", fallback_disclosure: null, drawing: null,
  },
  bonuses: { object: "song_asset_bonus_list", items: [{
    object: "song_asset_bonus_projection", offer_id: "offer", leg_id: "bonus", community_id: "community-story", post_id: "post-1",
    offer_status: "active", leg_status: "active", chain_id: 84532, token_address: "0x0000000000000000000000000000000000000001", token_decimals: 6, token_symbol: "USDC", asset_policy_version: "asset-v1",
    amount_per_claim_atomic: "2500000", max_claims: 20, claimed_count: 4, available_inventory_atomic: "40000000",
    viewer_state: null, viewer_credit_id: null, viewer_credit_state: null,
    qualification_policies: [{ activity: "study", policy: { kind: "study_session_first_pass_v2", qualification_policy_version_id: "study-v2", required_correct_bps: 7000 } }],
  }] },
};
export const noActivityRewardsFixture: SongActivityRewards = { pool: null, bonuses: { object: "song_asset_bonus_list", items: [] } };

/** API-reported drawing-wide jackpot; intentionally distinct from the $10 ticket budget. */
export const jackpotActivityRewardsFixture: SongActivityRewards = {
  ...activityRewardsFixture,
  pool: { ...activityRewardsFixture.pool!, drawing: {
    object: "megapot_pool_drawing_projection", drawing_id: "review-drawing", lifecycle_status: "entry_open", state: "entry_open",
    entry_cutoff_at: "2099-01-01T00:00:00Z", beneficiary_count: 0, ticket_price_ceiling_atomic: "1000000", actual_ticket_cost_atomic: "0",
    gross_prize_pool_atomic: "1000000000000", global_tickets_bought: null, prize_pool_observed_at: "2026-10-07T12:00:00Z",
    prize_pool_basis: "gross_observed_before_referral_win_share_terminal_last_observed_pre_rollover", global_tickets_basis: "drawing_wide_all_megapot_buyers",
    net_winnings_atomic: "0", commitment_reference: null, snapshot_hash: null, ticket_id: null, purchase_transaction_hash: null, claim_transaction_hash: null,
  } },
};

/** Two independent rewards for karaoke; the asset bonus is shared with study. */
export const multipleActivityRewardsFixture: SongActivityRewards = {
  ...jackpotActivityRewardsFixture,
  bonuses: { ...activityRewardsFixture.bonuses, items: activityRewardsFixture.bonuses.items.map(bonus => ({
    ...bonus,
    qualification_policies: [...(bonus.qualification_policies ?? []), ...(activityRewardsFixture.pool?.qualification_policies ?? [])],
  })) },
};
