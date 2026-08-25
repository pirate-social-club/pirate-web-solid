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
  | {
      kind: "start_verification";
      requirement: "human_identity";
      providerId: string;
      creationIntentId: string;
      ceremonyIntentId: string;
      generation: number;
    }
  | { kind: "commit" }
  | {
      kind: "wait";
      requirement: "human_identity" | null;
      reasonCode: WaitReasonCode;
      retryAfterSeconds?: number;
    }
  | { kind: "blocked"; reason: "quota_exceeded" | "gate_unsupported" }
  | { kind: "none"; reason: "committed" | "expired" | "cancelled" };

export const HUMAN_IDENTITY_STATUSES = ["unmet", "pending", "satisfied", "failed", "expired"] as const;
export type HumanIdentityStatus = (typeof HUMAN_IDENTITY_STATUSES)[number];

export interface HumanIdentityProgress {
  requirement: "human_identity";
  status: HumanIdentityStatus;
  providerId: string;
  ceremonyIntentId: string | null;
  generation: number;
  satisfiedAt: string | null;
}

/**
 * A narrow projection of the full creation intent, shaped for the progress
 * view. It intentionally omits wire fields the UI does not render, including
 * the draft, canonical policy hash and revision, requirement_hash, persona role
 * presentation, and the committed resource payload.
 */
export interface CommunityCreationIntentView {
  intentId: string;
  revision: number;
  status: CreationStatus;
  nextAction: CreationNextAction;
  humanIdentity: HumanIdentityProgress;
  expiresAt: string;
  committedHref?: string | null;
}

export function createIntent(overrides: Partial<CommunityCreationIntentView> = {}): CommunityCreationIntentView {
  return {
    intentId: "creation_1",
    revision: 1,
    status: "draft",
    nextAction: { kind: "wait", requirement: null, reasonCode: "operation_pending" },
    humanIdentity: {
      requirement: "human_identity",
      status: "unmet",
      providerId: "very",
      ceremonyIntentId: null,
      generation: 0,
      satisfiedAt: null,
    },
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
  patch: Partial<Pick<CommunityCreationIntentView, "status" | "nextAction" | "humanIdentity">>,
): IntentUpdateResult {
  if (intent.revision !== expectedRevision) {
    return { kind: "conflict", latestRevision: intent.revision };
  }
  return { kind: "updated", intent: { ...intent, ...patch, revision: intent.revision + 1 } };
}

export const creationProgressCopy = {
  title: "Community creation",
  statusLabels: {
    draft: "Draft",
    verification_required: "Verify your identity",
    commit_ready: "Ready to commit",
    committed: "Community created",
    quota_exceeded: "Creation blocked",
    gate_unsupported: "Gate not supported",
    expired: "Creation expired",
    cancelled: "Creation cancelled",
  } satisfies Record<CreationStatus, string>,
  identityHeading: "Human identity",
  identityStatusLabels: {
    unmet: "Not verified",
    pending: "Verification in progress",
    satisfied: "Verified",
    failed: "Verification failed",
    expired: "Verification expired",
  } satisfies Record<HumanIdentityStatus, string>,
  providerLabel: "Provider",
  generationLabel: "Attempt",
  startVerification: "Start verification",
  commit: "Commit community",
  retry: "Retry",
  viewCommunity: "View community",
  waitReasonLabels: {
    verification_pending: "Identity verification is still in progress.",
    membership_pending: "Waiting for membership confirmation.",
    operation_pending: "A background operation is still running.",
    reconciliation_pending: "Reconciling your account.",
  } satisfies Record<WaitReasonCode, string>,
  retryAfterPrefix: "Retry in",
  revisionPrefix: "Revision",
  quotaExceededBody: "You've reached the limit of communities you can create.",
  gateUnsupportedBody: "A selected gate isn't supported by the current provider.",
  expiredBody: "This creation draft expired. Start a new community to continue.",
  cancelledBody: "This creation was cancelled.",
  committedBody: "Your community is live.",
  staleTitle: "This creation changed",
  staleBody: "The creation was updated by another action. Review the latest revision and try again.",
  staleExpectedLabel: "You were editing revision",
  staleLatestLabel: "the latest is revision",
} as const;
