// Boost a song: the sponsor flow reached from a post's overflow menu. Modelled
// on the legacy BoostCampaignSheet state machine (compose → quote → confirming →
// awaiting-finality → active) with the same "either" activity default.
//
// Backend shape this maps onto: a song has one non-terminal offer
// (song_reward_offers_one_nonterminal_per_post_uidx) and rewards are legs on it.
// A Megapot leg holds eligible_activities as a list; a token bonus must have it
// NULL, so a token bonus is always "either" and offers no activity choice.

export type BoostKind = "megapot_pool" | "asset_bonus";

/** "either" is the default. Only a Megapot leg can narrow it. */
export type BoostActivity = "study" | "karaoke" | "either";

export type BoostStep =
  | "compose"
  | "quote"
  | "confirming"
  | "awaiting_finality"
  | "active"
  | "top_up"
  | "failed";

export interface BoostDraft {
  readonly kind: BoostKind;
  /** Total the sponsor is putting in, as typed. */
  readonly budgetLabel: string;
  /** Paid per qualifying account. Absent for a pool, which splits instead. */
  readonly rewardPerClaimLabel?: string;
  readonly activity: BoostActivity;
  readonly tokenSymbol: string;
}

export interface BoostQuote {
  readonly kind: BoostKind;
  readonly budgetLabel: string;
  readonly tokenSymbol: string;
  /** e.g. "up to 10 accounts" or "12 sharing today's ticket". */
  readonly yieldLabel: string;
  readonly activity: BoostActivity;
}

export interface BoostLive {
  readonly kind: BoostKind;
  readonly rewardLabel: string;
  readonly remainingLabel: string;
}

export type BoostFailure =
  /** Locally proven pre-send failures. Safe to quote again. */
  | "wrong_chain" | "assignment_mismatch" | "insufficient_token_balance"
  | "insufficient_gas_balance" | "reauthentication_required"
  /** Post-send. Never safe to resend. */
  | "transaction_mismatch" | "terms_changed" | "recovery_corrupt"
  | "recovery_unavailable" | "provider_rejected";

export type BoostState =
  | { readonly step: "compose"; readonly draft: BoostDraft; readonly problem?: string }
  | { readonly step: "quote"; readonly quote: BoostQuote }
  | { readonly step: "confirming" }
  | { readonly step: "awaiting_finality"; readonly transactionHash: string | null }
  | { readonly step: "active"; readonly live: BoostLive }
  | { readonly step: "top_up"; readonly live: BoostLive; readonly draft: BoostDraft }
  | { readonly step: "failed"; readonly failure: BoostFailure; readonly transactionHash: string | null };

export const kindTitle: Record<BoostKind, string> = {
  megapot_pool: "Megapot ticket",
  asset_bonus: "Token bonus",
};

export const activityLabel: Record<BoostActivity, string> = {
  either: "Study or singing",
  study: "Study only",
  karaoke: "Singing only",
};

/** A token bonus cannot be narrowed: the leg's activity column must be NULL. */
export function activityIsChoosable(kind: BoostKind): boolean {
  return kind === "megapot_pool";
}

/** Locally proven pre-send failures may be quoted again; post-send ones may not. */
export function canRestartFunding(failure: BoostFailure): boolean {
  return failure === "wrong_chain" || failure === "assignment_mismatch"
    || failure === "insufficient_token_balance" || failure === "insufficient_gas_balance"
    || failure === "reauthentication_required";
}

export function failureTitle(failure: BoostFailure): string {
  switch (failure) {
    case "wrong_chain": return "Wrong network";
    case "assignment_mismatch": return "Wrong wallet";
    case "insufficient_token_balance": return "Not enough tokens";
    case "insufficient_gas_balance": return "Not enough for the fee";
    case "reauthentication_required": return "Confirm it's you";
    case "transaction_mismatch": return "Two different transactions";
    case "terms_changed": return "Terms changed";
    case "provider_rejected": return "Wallet reported a rejection";
    case "recovery_corrupt": return "Can't read this attempt";
    case "recovery_unavailable": return "Couldn't save this attempt";
  }
}

export function failureLine(failure: BoostFailure): string {
  switch (failure) {
    case "wrong_chain": return "Switch your wallet to Base Sepolia. Nothing was sent.";
    case "assignment_mismatch": return "Fund from this persona's wallet. Nothing was sent.";
    case "insufficient_token_balance": return "Top up this wallet and try again. Nothing was sent.";
    case "insufficient_gas_balance": return "You need a little ETH for the fee. Nothing was sent.";
    case "reauthentication_required": return "Sign in to your wallet again. Nothing was sent.";
    case "transaction_mismatch": return "This reward is settling a different transaction than we recorded.";
    case "terms_changed": return "Your transfer is tracked. It needs checking against the current terms.";
    case "provider_rejected": return "We can't prove nothing was sent, so this stays locked.";
    case "recovery_corrupt": return "Kept rather than cleared, so nothing can be sent twice.";
    case "recovery_unavailable": return "This may not survive a reload. You can give us the hash.";
  }
}
