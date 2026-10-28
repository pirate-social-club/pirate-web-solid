import type { SharedSongParticipation } from "../../api/shared-song-participation.ts";

type Disposition = Pick<SharedSongParticipation["terms"], "empty_behavior" | "empty_winnings_recipient">;

/** Present only the captured terms; historical purchase order is not inferred. */
export function sharedPotDisposition(terms: Disposition): string {
  if (terms.empty_behavior === "no_purchase") return "If nobody qualifies, there is no allocation.";
  const spending = "A ticket is bought before participants qualify. Its cost is spent even if nobody qualifies.";
  if (terms.empty_behavior === "single_funder_ticket_first_v1") return `This pot has one funder. ${spending} If nobody qualifies, any net winnings go to the pot’s single funder. This rule is fixed before payment.`;
  const recipient = terms.empty_winnings_recipient;
  if (!recipient || !/^0x[a-f0-9]{40}$/u.test(recipient) || /^0x0{40}$/u.test(recipient)) throw new Error("reward_treasury_terms_invalid");
  return `${spending} If nobody qualifies, any net winnings stay in this pot’s Safe as treasury funds. Treasury wallet: ${recipient}. The recipient and rule are fixed before payment.`;
}
