import type { GeneratedLocaleCatalogs } from "../../../locales/generated";

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
      requirement: "human_identity" | null;
      reasonCode: WaitReasonCode;
      retryAfterSeconds?: number;
    }
  | { kind: "blocked"; reason: "quota_exceeded" | "gate_unsupported" | "pre_boundary_verification" | "persona_activation_unavailable" }
  | { kind: "none"; reason: "committed" | "expired" | "cancelled" };

/**
 * A narrow projection of the full creation intent, shaped for the progress
 * view. It carries `revision` because every mutating command needs it for
 * optimistic concurrency, even though the number is never rendered. It omits
 * wire fields the UI neither renders nor sends: the draft, the canonical policy
 * hash, requirement_hash, persona role presentation, and the committed resource
 * payload. Creator verification is no longer part of this progress model.
 */
export interface CommunityCreationIntentView {
  intentId: string;
  revision: number;
  status: CreationStatus;
  nextAction: CreationNextAction;
  expiresAt: string;
  committedHref?: string | null;
}

export function createIntent(overrides: Partial<CommunityCreationIntentView> = {}): CommunityCreationIntentView {
  return {
    intentId: "creation_1",
    revision: 1,
    status: "draft",
    nextAction: { kind: "wait", requirement: null, reasonCode: "operation_pending" },
    expiresAt: "2026-08-26T00:00:00.000Z",
    committedHref: null,
    ...overrides,
  };
}

export function isTerminal(intent: Pick<CommunityCreationIntentView, "status">): boolean {
  return intent.status === "committed" || intent.status === "expired" || intent.status === "cancelled";
}

export function isStaleRevision(intent: Pick<CommunityCreationIntentView, "revision">, expectedRevision: number): boolean {
  return intent.revision !== expectedRevision;
}

export type IntentUpdateResult =
  | { kind: "updated"; intent: CommunityCreationIntentView }
  | { kind: "conflict"; latestRevision: number };

export function applyIntentUpdate(
  intent: CommunityCreationIntentView,
  expectedRevision: number,
  patch: Partial<Pick<CommunityCreationIntentView, "status" | "nextAction">>,
): IntentUpdateResult {
  if (intent.revision !== expectedRevision) {
    return { kind: "conflict", latestRevision: intent.revision };
  }
  return { kind: "updated", intent: { ...intent, ...patch, revision: intent.revision + 1 } };
}

export type CreationProgressCopy = {
  [Key in keyof GeneratedLocaleCatalogs["en"]["routes"]["communityCreationProgress"]]: string;
};

export const CREATION_STATUS_COPY_KEYS = {
  draft: "statusDraft",
  verification_required: "statusVerificationRequired",
  commit_ready: "statusCommitReady",
  committed: "statusCommitted",
  quota_exceeded: "statusQuotaExceeded",
  gate_unsupported: "statusGateUnsupported",
  expired: "statusExpired",
  cancelled: "statusCancelled",
} as const satisfies Record<CreationStatus, keyof CreationProgressCopy>;

export const WAIT_REASON_COPY_KEYS = {
  verification_pending: "waitVerificationPending",
  membership_pending: "waitMembershipPending",
  operation_pending: "waitOperationPending",
  reconciliation_pending: "waitReconciliationPending",
} as const satisfies Record<WaitReasonCode, keyof CreationProgressCopy>;
