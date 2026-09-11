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
  | { kind: "activate_profile"; personaId: string }
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
 * view and resumable form. It carries `revision` because every mutating command needs it for
 * optimistic concurrency, even though the number is never rendered. It omits
 * wire fields the UI neither renders nor sends: the canonical policy
 * hash, requirement_hash, persona role presentation, and the committed resource
 * payload. Creator verification is no longer part of this progress model.
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
