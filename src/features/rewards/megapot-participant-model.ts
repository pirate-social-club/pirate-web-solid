import type { ParticipantPool, ParticipantRewardSnapshot } from "../../api/megapot-participant-data.ts";

export function poolStatus(pool: ParticipantPool, now = Date.now()): string {
  const drawing = pool.drawing;
  if (pool.leg_status === "operational_hold" || pool.offer_status === "operational_hold" || drawing?.state === "operational_hold") return "Pool temporarily on hold";
  if (drawing?.state === "won") return "Winning draw";
  if (drawing?.state === "no_win") return "Draw finished · no win";
  if (drawing?.state === "ticket_purchased" || drawing?.state === "drawing_pending") return "Ticket purchased · awaiting draw";
  if (pool.leg_status !== "active" || pool.offer_status !== "active") return "Pool entries unavailable";
  if (drawing?.state === "entry_open") {
    return Date.parse(drawing.entry_cutoff_at) > now ? "Pool entries open" : "Pool entries closed";
  }
  if (drawing?.state === "entry_closed" || drawing?.state === "committed") return "Pool entries closed · ticket pending";
  return "Pool awaiting a drawing";
}

export function participantMessage({ pool, standing }: ParticipantRewardSnapshot): string {
  if (!standing.share_held) return "No share is confirmed for your account in this drawing. Reward processing may still be pending.";
  if (standing.participant_state === "operational_hold") return "Your share is recorded. This pool is temporarily on hold.";
  if (standing.participant_state === "no_win") return "You held a share in this drawing. The ticket did not win.";
  if (standing.participant_state === "sent") return "Your winnings were sent to your wallet.";
  if (standing.participant_state === "payout_pending") return "Your winnings are being sent to your wallet.";
  if (standing.participant_state === "won") return "Your share won. Open Wallet to review your winnings and claim.";
  return `You have a share in drawing ${pool.drawing?.drawing_id}. Qualifying again in this drawing does not add another share.`;
}

export function rewardTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time unavailable";
  return `${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date)} UTC`;
}
