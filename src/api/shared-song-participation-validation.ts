import type { SharedSongParticipation } from "./shared-song-participation.ts";

const bindingKeys = ["template_key", "activity", "grading_family", "qualification_policy_id", "qualification_policy_hash", "numeric_floor_bps", "choreography_scope", "admission_id", "admission_hash", "disclosure_version", "binding_id", "objective_id", "offer_id", "leg_id"] as const;
const sameBinding = (a: SharedSongParticipation["terms"]["qualification_bindings"][number], b: typeof a) => bindingKeys.every(key => a[key] === b[key]);

/** The genuine client enforces wire shapes. These cross-field relations also
 * bind the frozen terms, rules, complete schedule and amount before display.
 * Custody, hashes and private allocation evidence remain the server's proof. */
export function assertSharedSongParticipation(value: SharedSongParticipation): void {
  const reject = () => { throw new Error("reward_projection_inconsistent"); };
  const { terms, target } = value, ids = terms.planned_drawing_ids;
  if (terms.eligible_activities.length !== 3 || !["study", "karaoke", "dance"].every(activity => terms.eligible_activities.includes(activity))
    || terms.qualification_bindings.length !== 3 || value.qualification_rules.length !== 3
    || new Set(value.qualification_rules.map(row => row.binding.activity)).size !== 3) reject();
  for (const { binding, rule } of value.qualification_rules) {
    if (binding.offer_id !== target.offer_id || binding.leg_id !== target.pool_leg_id
      || !terms.qualification_bindings.some(original => sameBinding(original, binding))
      || rule.qualification_policy_version_id !== binding.qualification_policy_id) reject();
    if (binding.activity === "dance") {
      if (binding.grading_family !== "moderator_verdict" || binding.numeric_floor_bps !== null
        || binding.choreography_scope !== "any_policy_accepted" || rule.kind !== "dance_owner_verdict_v1") reject();
    } else if (binding.grading_family !== "numeric" || binding.numeric_floor_bps === null || binding.choreography_scope !== "not_applicable"
      || (binding.activity === "study" ? rule.kind !== "study_session_first_pass_v2" : !["karaoke_qualification_v1", "karaoke_qualification_v2"].includes(rule.kind))) reject();
  }
  if (ids.length === 0 || ids.length > 30 || new Set(ids).size !== ids.length || ids[0] !== terms.first_drawing_id
    || ids.at(-1) !== terms.last_planned_drawing_id || value.drawings.length !== ids.length
    || ids.some((id, i) => i > 0 && BigInt(id) <= BigInt(ids[i - 1]))) reject();
  for (const [i, row] of value.drawings.entries()) {
    if (row.planned_drawing_id !== ids[i]) reject();
    if (row.kind === "not_open") continue;
    const { drawing, standing } = row;
    if (row.planned_drawing_id !== drawing.drawing_id || Date.parse(row.drawing_at) <= Date.parse(drawing.entry_cutoff_at)
      || (drawing.state === "entry_open" && Date.parse(drawing.entry_cutoff_at) <= Date.parse(value.as_of))
      || (standing.share_held && drawing.beneficiary_count === 0)
      || (drawing.gross_prize_pool_atomic === null) !== (drawing.global_tickets_bought === null)
      || (drawing.gross_prize_pool_atomic === null) !== (drawing.prize_pool_observed_at === null)) reject();
    const credit = standing.credit;
    if (credit && (!standing.share_held || !["allocated", "credited"].includes(drawing.lifecycle_status)
      || BigInt(credit.amount_atomic) <= 0n || BigInt(credit.amount_atomic) > BigInt(drawing.net_winnings_atomic)
      || (credit.claim.status === "accepted") !== (credit.claim.payout_status !== null))) reject();
  }
}
