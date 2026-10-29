import { formatUnits, parseUnits } from "viem";
import type { SongContributionContext, SongContributionReady, SongContributionReceipt, SongContributionState } from "../../api/song-contributions.ts";

export type SharedPotTerms = Extract<SongContributionReady["quote"], { readonly kind: "prospective" }>["prospective_terms"] | SongContributionReceipt["committed_terms"];
export const usdc = (atomic: string) => `${formatUnits(BigInt(atomic), 6)} USDC`;
export const contributionChainLabel = (chain: 84532 | 8453) => chain === 84532 ? "Base Sepolia (testnet)" : "Base";
export const maximumContribution = (context: SongContributionReady) => BigInt(context.limits.usable_capacity_atomic) < BigInt(context.limits.maximum_atomic) ? context.limits.usable_capacity_atomic : context.limits.maximum_atomic;
export function contributionAmount(value: string): string {
  if (!/^[0-9]+(?:\.[0-9]{1,6})?$/u.test(value)) throw new Error("contribution_amount_invalid");
  const result = parseUnits(value, 6);
  if (result <= 0n || result >= 2n ** 256n) throw new Error("contribution_amount_invalid");
  return result.toString();
}
export const contextTerms = (context: SongContributionReady): SharedPotTerms => context.quote.kind === "prospective" ? context.quote.prospective_terms : context.quote.committed_terms;
export const termsEnd = (terms: SharedPotTerms) => terms.version === "shared-song-megapot-prospectus-v1" ? terms.fixed_ends_at : terms.ends_at;
export function qualificationLines(terms: SharedPotTerms): readonly string[] {
  const bindings = terms.version === "shared-song-megapot-prospectus-v1" ? terms.qualification_templates : terms.qualification_bindings;
  return bindings.map(binding => binding.grading_family === "moderator_verdict"
    ? "Dance: a community-owner review must pass before the drawing closes."
    : binding.numeric_floor_bps === null
      ? `${binding.activity === "study" ? "Study" : "Singing"}: qualification requirements are unavailable.`
      : `${binding.activity === "study" ? "Study" : "Singing"}: meet the ${binding.numeric_floor_bps / 100}% qualification requirement.`);
}
const unavailable = {
  target_persona_required: "Choose a profile in this community.", wallet_not_ready: "This profile’s wallet is not ready.",
  quota_exhausted: "This account cannot start another contribution yet.", excluded: "This song cannot accept your contribution.",
  policy_unavailable: "Contribution terms are unavailable.", mixed_objective_unavailable: "The song’s activity requirements are unavailable.",
  legacy_pool_occupied: "The song’s existing reward needs to finish first.", schedule_unproven: "The drawing schedule is unavailable.",
  observation_stale: "The payment information needs to refresh.", capacity_exhausted: "This pot cannot accept more contributions right now.",
  work_budget_exhausted: "Contributions are temporarily unavailable.", gas_unavailable: "The payment fee is not ready.",
  paused: "Contributions are paused.", attestation_unavailable: "Payment details are unavailable.", recovery_required: "Check your existing contribution before starting another.",
} satisfies Record<Extract<SongContributionContext, { readonly readiness: "unavailable" }>["reason"], string>;
export const contributionUnavailable = (context: Extract<SongContributionContext, { readonly readiness: "unavailable" }>) => unavailable[context.reason];
const statusLabels = {
  instruction_issued: ["Ready to pay", "Review the saved amount and payment fee before paying."],
  submission_claimed: ["Payment reserved", "Check the original payment. A new payment will not be sent automatically."],
  broadcast_unknown: ["Checking your payment", "The wallet outcome is uncertain. Keep this original payment while it is checked."],
  confirming: ["Confirming payment", "Your original transaction is being checked."],
  pool_credited: ["Contribution added", "The confirmed contribution has been added to this song’s shared pot."],
  expired_reconciling: ["Checking expired payment", "Expiry alone does not prove that the payment failed."],
  late_principal_owed: ["Late payment awaiting return", "This payment did not enter the pot. Its recorded principal is awaiting return."],
  refund_pending: ["Return pending", "The recorded return has not completed yet."],
  refunded: ["Returned", "The recorded principal return is complete."],
  nonce_closed_no_principal: ["Payment closed", "The original payment is closed without principal added to the pot."],
  manual_reconciliation_required: ["Payment needs attention", "Keep the saved payment and contact support for reconciliation."],
} satisfies Record<SongContributionState["state"], readonly [string, string]>;
// The 60-second payment window always closes before network finality, so a sent
// transfer reads as expired until the receipt is credited.
const sentAwaitingFinality = { title: "Confirming payment", detail: "Your payment was sent and is being checked." };
export const contributionStatus = (state: SongContributionState, sent = false) => state.state === "expired_reconciling" && sent
  ? sentAwaitingFinality
  : { title: statusLabels[state.state][0], detail: statusLabels[state.state][1] };
export function contributionFailure(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "contribution_amount_invalid") return "Enter an amount within the displayed limits, with up to six decimal places.";
    if (["contribution_review_expired", "contribution_review_changed", "wallet_fee_changed"].includes(error.message)) return "Payment details changed. Check the saved contribution and review it again.";
    if (["contribution_journal_unavailable", "contribution_journal_corrupt"].includes(error.message)) return "The saved payment cannot be read safely. Keep this browser’s data and contact support.";
    if (error.message === "wallet_reauthentication_required") return "Confirm access to your wallet to review the payment.";
  }
  return "The contribution could not be checked. Any saved payment is kept; check its status before trying again.";
}
