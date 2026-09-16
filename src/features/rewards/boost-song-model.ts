export type BoostKind = "megapot_pool" | "asset_bonus";

/** "either" is the default. Only a Megapot leg can narrow it. */
export type BoostActivity = "study" | "karaoke" | "either";

export type BoostStep =
  | "compose"
  | "quote"
  | "confirming"
  | "awaiting_finality"
  | "active"
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
  readonly activity: BoostActivity;
  /** What each qualifier gets, or how the pool splits. */
  readonly rewardLabel: string;
  readonly budgetLabel: string;
  /** The embedded wallet signs headlessly, so these must be shown here. */
  readonly senderLabel: string;
  readonly networkLabel: string;
  readonly feeLabel: string;
}

export interface BoostLive {
  readonly kind: BoostKind;
  readonly activity: BoostActivity;
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
  | {
      readonly step: "compose";
      readonly draft: BoostDraft;
      /** One-tap budgets, already formatted. */
      readonly presets: readonly string[];
      readonly problem?: string;
    }
  | { readonly step: "quote"; readonly quote: BoostQuote }
  | { readonly step: "confirming" }
  | { readonly step: "awaiting_finality"; readonly transactionHash: string | null }
  | { readonly step: "active"; readonly live: BoostLive }
  | { readonly step: "failed"; readonly failure: BoostFailure; readonly transactionHash: string | null };

export const kindTitle = {
  asset_bonus: "Token bonus",
  megapot_pool: "Megapot ticket",
} satisfies Record<BoostKind, string>;

/** Shown under each reward-type choice. One line, no jargon. */
export const kindBlurb = {
  asset_bonus: "Pay every qualifier the same amount until it runs out.",
  megapot_pool: "Qualifiers share net winnings from tickets funded by this reward.",
} satisfies Record<BoostKind, string>;

/** Legacy labels, unchanged. */
export const activityTitle = {
  karaoke: "Karaoke",
  study: "Study",
  either: "Either",
} satisfies Record<BoostActivity, string>;

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
    case "terms_changed": return "This attempt needs checking against the current funding instructions. Keep any transaction hash.";
    case "provider_rejected": return "We can't prove nothing was sent, so this stays locked.";
    case "recovery_corrupt": return "The saved attempt cannot be read. Keep its record and check with support before sending anything.";
    case "recovery_unavailable": return "The browser could not save or read this attempt. Keep any transaction hash and check its status.";
  }
}

/** A token bonus always counts for either activity: its leg column must be NULL. */
export function activityCaption(kind: BoostKind, activity: BoostActivity): string {
  return kind === "asset_bonus"
    ? "Counts for studying or karaoke."
    : `Counts for ${activityTitle[activity].toLowerCase()}.`;
}
