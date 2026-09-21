export const CREATION_STATUSES = [
  "draft",
  "verification_required",
  "commit_ready",
  "committed",
  "quota_exceeded",
  "gate_unsupported",
  "expired",
  "cancelled",
] as const;
export type CreationStatus = (typeof CREATION_STATUSES)[number];

export const WAIT_REASON_CODES = [
  "verification_pending",
  "membership_pending",
  "operation_pending",
  "reconciliation_pending",
] as const;
export type WaitReasonCode = (typeof WAIT_REASON_CODES)[number];

export type CreationNextAction =
  | { kind: "commit" }
  | {
      kind: "wait";
      requirement: "human_identity" | "nationality" | null;
      reasonCode: WaitReasonCode;
      retryAfterSeconds?: number;
    }
  | { kind: "blocked"; reason: "quota_exceeded" | "gate_unsupported" | "pre_boundary_verification" | "persona_activation_unavailable" }
  | { kind: "none"; reason: "committed" | "expired" | "cancelled" };

/**
 * A narrow projection of the full creation intent, shaped for the creation
 * route view and the resumable form. It carries `revision` because every
 * mutating command needs it for optimistic concurrency, even though the number
 * is never rendered. It omits wire fields the UI neither renders nor sends: the
 * canonical policy hash, requirement_hash, persona role presentation, and the
 * committed resource payload.
 */
export interface CommunityCreationIntentView {
  draft?: import("../create-community/create-community-model").CreateCommunityDraft;
  intentId: string;
  revision: number;
  status: CreationStatus;
  nextAction: CreationNextAction;
  expiresAt: string;
  committedHref?: string | null;
}
