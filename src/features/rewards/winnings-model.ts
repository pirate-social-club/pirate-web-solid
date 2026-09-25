import { formatUnits } from "viem";
import type { RewardClaimOutcome, RewardCredit } from "../../api/reward-claim.ts";

export type WinningView = Readonly<{
  creditId: string;
  amount: string;
  status: string;
  detail: string | null;
  canClaim: boolean;
}>;

/**
 * Spec 015 §5.2a. Only participant pool winnings carry a claim; other credits
 * are paid without one and are not listed here. The amount shown is the
 * confirmed credit, never a projection (§5.2a.1).
 */
export function winningViews(credits: readonly RewardCredit[]): readonly WinningView[] {
  return credits.flatMap((credit): WinningView[] => {
    const claim = credit.claim;
    if (claim === null) return [];
    const amount = `${formatUnits(BigInt(credit.amount_atomic), credit.token_decimals)} USDC`;
    const base = { creditId: credit.credit_id, amount };
    if (claim.status === "unclaimed") {
      return [{ ...base, status: "Held for you", detail: "Verify with a palm scan to claim it.", canClaim: true }];
    }
    if (claim.status === "subject_conflict") {
      return [{
        ...base,
        status: "Held",
        detail: "This palm scan has already claimed winnings from this pool. The amount stays held for you; contact support.",
        canClaim: false,
      }];
    }
    switch (claim.payout_status) {
      case "confirmed":
        return [{ ...base, status: "Sent to your wallet", detail: null, canClaim: false }];
      case "recipient_pending":
        return [{ ...base, status: "Claimed", detail: "Waiting for your wallet to be ready.", canClaim: false }];
      case "failed_retrying":
        return [{ ...base, status: "Claimed", detail: "Sending is taking longer than usual. It will retry.", canClaim: false }];
      default:
        return [{ ...base, status: "Claimed", detail: "Sending to your wallet.", canClaim: false }];
    }
  });
}

export type ClaimStep =
  | Readonly<{ kind: "done" }>
  | Readonly<{ kind: "verify" }>
  | Readonly<{ kind: "held" }>
  | Readonly<{ kind: "unavailable" }>;

export function claimStep(outcome: RewardClaimOutcome): ClaimStep {
  switch (outcome) {
    case "accepted":
      return { kind: "done" };
    case "verification_missing":
    case "verification_stale":
    case "verification_failed":
      return { kind: "verify" };
    case "subject_conflict":
      return { kind: "held" };
    default:
      return { kind: "unavailable" };
  }
}

/** Same-origin return path that resumes one claim after the palm scan. */
export function verifyToClaimUrl(creditId: string): string {
  const returnTo = `/wallet?claim=${encodeURIComponent(creditId)}`;
  return `/verify/very?purpose=reward_claim&return_to=${encodeURIComponent(returnTo)}`;
}
