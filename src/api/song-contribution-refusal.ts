import { ApiClientError } from "@pirate/api-client";
import { decodeContributionCommand, decodeJournalRecord, journalHash, journalIdentifier, journalLiteral, parseJournalJson } from "./contribution-command-codec.ts";
import type { SongContributionRequest, SongContributionScope } from "./song-contributions.ts";

export interface ContributionRefusalProof {
  readonly command_id: string;
  readonly request_hash: string;
  readonly allocation: "none";
  readonly instruction_issued: false;
}
export class ContributionCreationRefused extends Error {
  constructor(readonly reason: string, readonly proof: ContributionRefusalProof) { super("contribution_creation_refused"); }
}
const refusalCodes = new Set([
  "invalid_request", "not_found", "context_stale", "terms_mismatch", "lifecycle_changed",
  "persona_not_owned", "persona_wrong_community", "wallet_not_ready", "wallet_nonce_busy",
  "quota_exhausted", "account_excluded", "policy_unavailable", "mixed_objective_unavailable",
  "legacy_pool_incompatible", "schedule_unproven", "observation_stale", "price_changed",
  "cutoff_passed", "amount_below_minimum", "capacity_exhausted", "effect_limit", "attempt_limit",
  "rate_limited", "work_budget_exhausted", "gas_budget_unavailable", "paused",
  "attestation_unavailable", "recovery_required", "quote_expired", "quote_mismatch", "quote_reference_invalid",
]);
const declaredErrors = new Set(["ContributionBadRequestV2", "ContributionForbiddenV2", "ContributionNotFoundV2", "ContributionConflictV2", "ContributionUnavailableV2", "ContributionRateLimitedV2", "ContributionPausedV2"]);
export function decodeContributionRefusalProof(value: unknown): ContributionRefusalProof {
  const raw = JSON.stringify(value);
  if (raw === undefined) throw new Error("contribution_resolution_unproven");
  return decodeJournalRecord<ContributionRefusalProof>(parseJournalJson(raw), {
    command_id: journalIdentifier, request_hash: journalHash, allocation: journalLiteral("none"), instruction_issued: journalLiteral(false),
  });
}
/** The genuine client validates the complete declared error. This additional
 * check keeps generic errors and uncertain outcomes outside journal release. */
export function contributionRefusalFromError(error: unknown): ContributionCreationRefused | null {
  if (!(error instanceof ApiClientError) || !error.declaredName || !declaredErrors.has(error.declaredName)) return null;
  const details = error.details;
  if (!details || details.object !== "contribution_error" || details.version !== 2 || typeof details.code !== "string" || !refusalCodes.has(details.code) || details.refusal_receipt == null) return null;
  try { return new ContributionCreationRefused(details.code, decodeContributionRefusalProof(details.refusal_receipt)); }
  catch { return null; }
}

/** Public V5 Create commitment, owned here without a backend runtime import.
 * Ordered pairs and empty snapshot -> null match the genuine129 protocol. */
export async function contributionCreationRequestHash(scope: SongContributionScope, body: SongContributionRequest): Promise<string> {
  const command = decodeContributionCommand("CreateSongMegapotContributionV2", JSON.stringify(body));
  if (command.operation !== "CreateSongMegapotContributionV2") throw new Error("contribution_resolution_unproven");
  const b = command.body;
  if (scope.personaId !== b.persona_id) throw new Error("contribution_scope_changed");
  const context = [
    ["version", b.context_version], ["slot_id", b.context_slot_id], ["slot_generation", b.context_slot_generation],
    ["leg_snapshot_id", b.context_leg_snapshot_id === "" ? null : b.context_leg_snapshot_id],
    ["schedule_witness_id", b.context_schedule_witness_id], ["profile_id", b.context_profile_id],
    ["profile_hash", b.context_profile_hash], ["funding_policy_hash", b.context_funding_policy_hash],
    ["wallet_assignment_id", b.context_wallet_assignment_id], ["wallet_assignment_revision", b.context_wallet_assignment_revision],
    ["lifecycle_revision", b.context_lifecycle_revision],
  ];
  const payload = [
    ["version", b.version], ["idempotency_key", b.idempotency_key], ["persona_id", b.persona_id],
    ["funding_amount_atomic", b.funding_amount_atomic], ["expected_context_hash", b.expected_context_hash],
    ["expected_lifecycle_revision", b.expected_lifecycle_revision], ["context_ref", context],
    ["expected_terms", [["kind", b.expected_terms_kind], [b.expected_terms_kind === "prospective" ? "prospective_terms_hash" : "terms_hash", b.expected_terms_hash]]],
  ];
  const preimage = JSON.stringify(["pirate.song-megapot-command.v2", ["CreateSongMegapotContributionV2", scope.accountId, scope.communityId, scope.postId, null, payload]]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(preimage));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
