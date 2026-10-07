import { expect, it } from "vitest";
import { songActivityRewards } from "./song-activities-rewards.ts";
import { activityRewardsFixture, noActivityRewardsFixture } from "./song-activities.fixtures.ts";

it("attaches token amounts and lottery terms only to the activities that qualify", () => {
  const rewards = songActivityRewards(activityRewardsFixture);
  expect(rewards.map(reward => [reward.activity, reward.label])).toEqual([["study", "2.5 USDC bonus"], ["karaoke", "Lottery"]]);
  expect(rewards[0].terms.join(" ")).toContain("70% correct on the first pass");
  expect(rewards[0].terms.join(" ")).toContain("16 claims remaining");
  expect(rewards[1].terms.join(" ")).toContain("Additional score floor: 80%");
  expect(rewards[1].terms.join(" ")).toContain("not a guaranteed payout");
  expect(rewards[1].terms.join(" ")).toContain("held until you verify");
});
it.each(["expired", "exhausted", "paused", "ended", "operational_hold"] as const)("does not advertise %s offers", offer_status => {
  expect(songActivityRewards({ pool: { ...activityRewardsFixture.pool!, offer_status }, bonuses: { object: "song_asset_bonus_list", items: activityRewardsFixture.bonuses.items.map(bonus => ({ ...bonus, offer_status })) } })).toEqual([]);
});
it("does not advertise exhausted inventory, missing terms, closed entries or unfunded pools", () => {
  const pool = activityRewardsFixture.pool!;
  const bonus = activityRewardsFixture.bonuses.items[0];
  for (const patch of [{ claimed_count: bonus.max_claims }, { available_inventory_atomic: "0" }, { available_inventory_atomic: "2499999" }, { qualification_policies: null }]) {
    expect(songActivityRewards({ ...noActivityRewardsFixture, bonuses: { object: "song_asset_bonus_list", items: [{ ...bonus, ...patch }] } })).toEqual([]);
  }
  expect(songActivityRewards({ ...noActivityRewardsFixture, pool: { ...pool, available_budget_atomic: "0" } })).toEqual([]);
  expect(songActivityRewards({ ...noActivityRewardsFixture, pool: { ...pool, qualification_policies: null } })).toEqual([]);
});
it("closes reward entry at the cutoff even if server status has not advanced", () => {
  const pool = activityRewardsFixture.pool!;
  const drawing: NonNullable<typeof pool.drawing> = {
    object: "megapot_pool_drawing_projection", drawing_id: "drawing", lifecycle_status: "entry_open", state: "entry_open", entry_cutoff_at: "2026-10-07T12:00:00Z", beneficiary_count: 0,
    ticket_price_ceiling_atomic: "1000000", actual_ticket_cost_atomic: "0", gross_prize_pool_atomic: null, global_tickets_bought: null, prize_pool_observed_at: null,
    prize_pool_basis: "gross_observed_before_referral_win_share_terminal_last_observed_pre_rollover", global_tickets_basis: "drawing_wide_all_megapot_buyers", net_winnings_atomic: "0",
    commitment_reference: null, snapshot_hash: null, ticket_id: null, purchase_transaction_hash: null, claim_transaction_hash: null,
  };
  const data = { ...noActivityRewardsFixture, pool: { ...pool, drawing } };
  expect(songActivityRewards(data, Date.parse("2026-10-07T11:59:59Z"))).toHaveLength(1);
  expect(songActivityRewards(data, Date.parse(drawing.entry_cutoff_at))).toHaveLength(0);
  expect(songActivityRewards({ ...data, pool: { ...data.pool, drawing: { ...drawing, lifecycle_status: "cutoff_frozen" } } }, Date.parse("2026-10-07T11:00:00Z"))).toHaveLength(0);
});
