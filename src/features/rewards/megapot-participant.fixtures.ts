import type { ParticipantPool, ParticipantStanding } from "../../api/megapot-participant-data.ts";
export const participantPool: ParticipantPool = {
  object: "song_megapot_pool_projection", offer_id: "offer-1", leg_id: "leg-1", community_id: "community-1", post_id: "post-1",
  offer_status: "active", leg_status: "active", chain_id: 84532, token_address: "0x0000000000000000000000000000000000000001", token_decimals: 6,
  funded_atomic: "1000000", available_budget_atomic: "1000000", max_ticket_price_atomic: "10000", entry_cutoff_seconds: 600,
  eligible_activities: ["study", "karaoke"], min_score_bps: 7000, empty_pool_policy: "no_purchase",
  qualification_policies: [
    { activity: "study", policy: { kind: "study_session_first_pass_v2", qualification_policy_version_id: "study-v2", required_correct_bps: 7000 } },
    { activity: "karaoke", policy: { kind: "karaoke_qualification_v1", qualification_policy_version_id: "karaoke-v1", minimum_scored_line_count: 5, minimum_coverage_bps: 8500, minimum_final_score_bps: 7000 } },
  ],
  allocation_rule: "equal_v1", ticket_custody: "pirate", winnings_basis: "net_of_referral_win_share", fallback_disclosure: null,
  drawing: {
    object: "megapot_pool_drawing_projection", drawing_id: "42", lifecycle_status: "entry_open", state: "entry_open",
    entry_cutoff_at: "2099-10-09T00:00:00.000Z", beneficiary_count: 2, ticket_price_ceiling_atomic: "10000", actual_ticket_cost_atomic: "0",
    gross_prize_pool_atomic: "150000000", global_tickets_bought: "100", prize_pool_observed_at: "2026-10-08T12:00:00.000Z",
    prize_pool_basis: "gross_observed_before_referral_win_share_terminal_last_observed_pre_rollover", global_tickets_basis: "drawing_wide_all_megapot_buyers",
    net_winnings_atomic: "0", commitment_reference: null, snapshot_hash: null, ticket_id: null, purchase_transaction_hash: null, claim_transaction_hash: null,
  },
};
export const participantStanding: ParticipantStanding = {
  object: "megapot_pool_standing", leg_id: "leg-1", drawing_id: "42", participant_state: "your_share_held", share_held: true,
  share_amount_atomic: null, sponsor_fallback_state: null, sponsor_fallback_amount_atomic: null, reward_credit_id: null, reward_credit_state: null, beneficiary_count: 2,
};
