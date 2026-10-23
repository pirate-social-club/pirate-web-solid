import { formatUnits } from "viem";
import type { SharedSongDrawing, SharedSongParticipation } from "../../api/shared-song-participation.ts";

export function sharedSongAmount(atomic: string, chain: SharedSongParticipation["chain_id"]): string {
  return `${formatUnits(BigInt(atomic), 6)} ${chain === 84532 ? "test USDC" : "USDC"}`;
}

export function sharedSongRule(row: SharedSongParticipation["qualification_rules"][number]): string {
  const rule = row.rule, floor = row.binding.numeric_floor_bps;
  const additional = floor === null ? "" : ` Additional pool score floor: ${floor / 100}%.`;
  if (rule.kind === "study_session_first_pass_v2") return `Study: ${rule.required_correct_bps / 100}% correct on the first pass.${additional}`;
  if (rule.kind === "dance_owner_verdict_v1") return "Dance: a passed owner review under a funded Dance policy. Any choreography accepted by that policy is eligible; there is no numeric Dance score.";
  return `Singing: ${rule.minimum_final_score_bps / 100}% score, ${rule.minimum_coverage_bps / 100}% coverage and at least ${rule.minimum_scored_line_count} scored lines.${rule.kind === "karaoke_qualification_v2" ? ` Eligible tracks: ${rule.eligible_playback_kinds.map(kind => kind === "full_mix" ? "full mix" : "instrumental").join(" or ")}.` : ""}${additional}`;
}

export function sharedSongDrawingStatus(row: SharedSongDrawing, now: number): string {
  if (row.kind === "not_open") return "Not opened · time and result unavailable";
  const drawing = row.drawing;
  if (drawing.lifecycle_status === "operational_hold") return "Drawing temporarily on hold";
  if (drawing.lifecycle_status === "closed_no_entries") return "Closed without eligible entries · no ticket purchased";
  if (drawing.lifecycle_status.startsWith("closed_")) return "Closed without a ticket purchase";
  if (drawing.state === "no_win") return "Drawing finished · no win";
  if (drawing.state === "won") return "Winning drawing";
  if (drawing.state === "ticket_purchased" || drawing.state === "drawing_pending") return "Ticket purchased · awaiting drawing";
  if (drawing.state === "entry_open") return now < Date.parse(drawing.entry_cutoff_at) ? "Entries open" : "Entries closed · awaiting update";
  if (drawing.state === "entry_closed" || drawing.state === "committed") return "Entries closed · ticket pending";
  return "Awaiting drawing preparation";
}

export function sharedSongStanding(row: SharedSongDrawing, now: number): string {
  if (row.kind === "not_open") return "No share or result is confirmed for this planned drawing.";
  const { drawing, standing } = row;
  const credit = standing.credit;
  if (credit) {
    if (credit.state === "reconciliation_required") return "Your amount is recorded. Its payout needs reconciliation; review it in Wallet.";
    if (credit.claim.status === "subject_conflict") return "Your winnings remain held. This verification has already claimed from the pool; review it in Wallet.";
    if (credit.claim.status === "unclaimed") return "Your winnings are held for you. Open Wallet to verify with a palm scan and claim.";
    switch (credit.claim.payout_status) {
      case "confirmed": return "Your winnings were sent to your wallet. Open Wallet to review or send onward.";
      case "recipient_pending": return "Your claim is accepted. Waiting for your wallet to be ready.";
      case "failed_retrying": return "Your claim is accepted. Sending is taking longer than usual and will retry.";
      default: return "Your claim is accepted. The payout to your wallet is pending.";
    }
  }
  if (!standing.share_held) return drawing.state === "entry_open" && now < Date.parse(drawing.entry_cutoff_at)
    ? "No share is confirmed for your account. Only a qualifying activity earns a share."
    : "Your account has no confirmed share in this drawing.";
  if (drawing.state === "no_win") return "You held a share. The ticket did not win.";
  if (drawing.state === "won") return "Your share is recorded. Your individual allocation is not yet confirmed.";
  if (drawing.lifecycle_status === "operational_hold") return "Your share is recorded. This drawing is temporarily on hold.";
  return "Your share is recorded. Qualifying again in this drawing does not add another share.";
}
