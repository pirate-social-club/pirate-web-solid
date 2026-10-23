import { expect, it } from "vitest";
import type { SharedSongDrawing, SharedSongParticipation } from "./shared-song-participation.ts";
import { assertSharedSongParticipation } from "./shared-song-participation-validation.ts";
import { sharedSongParticipationFixture } from "../features/rewards/shared-song-participation.fixtures.ts";

type Change = (value: SharedSongParticipation) => SharedSongParticipation;
const changes: readonly [string, Change][] = [
  ["missing funded activity", value => ({ ...value, terms: { ...value.terms, eligible_activities: ["study", "karaoke"] } })],
  ["unbound rule", value => ({ ...value, qualification_rules: value.qualification_rules.map((row, i) => i ? row : { ...row, binding: { ...row.binding, admission_hash: "b".repeat(64) } }) })],
  ["different rule policy", value => ({ ...value, qualification_rules: value.qualification_rules.map((row, i) => i ? row : { ...row, rule: { ...row.rule, qualification_policy_version_id: "other-policy" } }) })],
  ["numeric Dance floor", value => ({ ...value, qualification_rules: value.qualification_rules.map(row => row.binding.activity !== "dance" ? row : { ...row, binding: { ...row.binding, numeric_floor_bps: 8000 } }) })],
  ["different offer", value => ({ ...value, target: { ...value.target, offer_id: "other-offer" } })],
  ["missing planned drawing", value => ({ ...value, drawings: value.drawings.slice(0, 1) })],
  ["reordered history", value => ({ ...value, drawings: [...value.drawings].reverse() })],
  ["duplicate drawing plan", value => ({ ...value, terms: { ...value.terms, planned_drawing_ids: ["200", "200"] } })],
  ["elapsed cutoff advertised open", value => ({ ...value, as_of: "2099-10-23T12:00:00.000Z" })],
  ["unproven share", value => ({ ...value, drawings: value.drawings.map(row => row.kind !== "materialized" ? row : { ...row, standing: { share_held: true, credit: null } }) })],
  ["partial prize observation", value => ({ ...value, drawings: value.drawings.map(row => row.kind !== "materialized" ? row : { ...row, drawing: { ...row.drawing, gross_prize_pool_atomic: "1000000" } }) })],
];
it.each(changes)("rejects cross-field inconsistency: %s", (_label, change) => {
  const value = sharedSongParticipationFixture();
  expect(() => assertSharedSongParticipation(value)).not.toThrow();
  expect(() => assertSharedSongParticipation(change(value))).toThrow("reward_projection_inconsistent");
});
it("requires a positive exact credit, allocated net winnings and consistent Claim evidence", () => {
  const value = sharedSongParticipationFixture(), row = value.drawings[0];
  if (row.kind !== "materialized") throw new Error("fixture drawing missing");
  const credit = { credit_id: "test-credit", amount_atomic: "450000", state: "credited" as const, claim: { status: "unclaimed" as const, payout_status: null } };
  const validRow = { ...row, drawing: { ...row.drawing, lifecycle_status: "credited" as const, state: "won" as const, beneficiary_count: 2, net_winnings_atomic: "900000" }, standing: { share_held: true, credit } };
  const withRow = (next: Extract<SharedSongDrawing, { kind: "materialized" }>) => ({ ...value, drawings: [next, value.drawings[1]] });
  expect(() => assertSharedSongParticipation(withRow(validRow))).not.toThrow();
  for (const invalid of [
    { ...validRow, standing: { ...validRow.standing, share_held: false } },
    { ...validRow, standing: { share_held: true, credit: { ...credit, amount_atomic: "0" } } },
    { ...validRow, standing: { share_held: true, credit: { ...credit, amount_atomic: "900001" } } },
    { ...validRow, drawing: { ...validRow.drawing, lifecycle_status: "winnings_detected" as const } },
    { ...validRow, standing: { share_held: true, credit: { ...credit, claim: { status: "accepted" as const, payout_status: null } } } },
  ]) expect(() => assertSharedSongParticipation(withRow(invalid))).toThrow("reward_projection_inconsistent");
});
