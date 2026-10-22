import { ApiClientError, type PirateApiClient } from "@pirate/api-client";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions } from "./client.ts";

type ContextOp = "get_communitiesCommunityIdPostsPostIdMegapotFundingContext";
type CreateOp = "post_communitiesCommunityIdPostsPostIdMegapotContributions";
type StateOp = "get_communitiesCommunityIdPostsPostIdMegapotContributionsContributionId";
type CommandOp = "get_communitiesCommunityIdPostsPostIdMegapotContributionCommandsOperationIdempotencyKey";
type ClaimOp = "post_communitiesCommunityIdPostsPostIdMegapotContributionsContributionIdSubmissionClaims";
type ObserveOp = "post_communitiesCommunityIdPostsPostIdMegapotContributionsContributionIdObservations";
type RecoverOp = "post_communitiesCommunityIdPostsPostIdMegapotContributionsContributionIdRecoveries";
type CancelOp = "post_communitiesCommunityIdPostsPostIdMegapotContributionsContributionIdCancellationPreparations";
type Operation = ContextOp | CreateOp | StateOp | CommandOp | ClaimOp | ObserveOp | RecoverOp | CancelOp;
type Input<K extends Operation> = Parameters<PirateApiClient[K]>[0];
type Reply<K extends Operation> = Awaited<ReturnType<PirateApiClient[K]>>;

export type SongContributionContext = Reply<ContextOp>;
export type SongContributionReady = Extract<SongContributionContext, { readonly readiness: "ready" }>;
export type SongContributionRequest = Input<CreateOp>["body"];
export type SongContributionReceipt = Reply<CreateOp>;
export type SongContributionState = Reply<StateOp>;
export type SongContributionCommand = Input<CommandOp>["path"]["operation"];
export type SongContributionClaim = Input<ClaimOp>["body"];
export type SongContributionObservation = Input<ObserveOp>["body"];
export type SongContributionRecovery = Input<RecoverOp>["body"];
export type SongContributionCancellation = Input<CancelOp>["body"];
export interface SongContributionScope {
  readonly accountId: string;
  readonly personaId: string;
  readonly communityId: string;
  readonly postId: string;
}

const commandObjects = {
  CreateSongMegapotContributionV2: "song_megapot_contribution_command_receipt",
  ClaimSongMegapotContributionSubmissionV2: "contribution_submission_claim_receipt",
  ObserveSongMegapotContributionV2: "contribution_observation_command_receipt",
  RecoverSongMegapotContributionV2: "contribution_recovery_command_receipt",
  PrepareSongMegapotContributionCancellationV2: "contribution_cancellation_command_receipt",
} as const satisfies Record<SongContributionCommand, Reply<CommandOp>["object"]>;

/** Flat genuine129 wire request. Missing leg identity has its admitted empty-string encoding. */
export function songContributionRequest(context: SongContributionReady, amountAtomic: string, idempotencyKey: string): SongContributionRequest {
  const ref = context.context_ref, quote = context.quote;
  return Object.freeze({
    version: 2, idempotency_key: idempotencyKey, persona_id: context.actor.persona_id,
    funding_amount_atomic: amountAtomic, expected_context_hash: context.context_hash,
    expected_lifecycle_revision: context.lifecycle_revision,
    context_version: ref.version, context_slot_id: ref.slot_id,
    context_slot_generation: ref.slot_generation, context_leg_snapshot_id: ref.leg_snapshot_id ?? "",
    context_schedule_witness_id: ref.schedule_witness_id, context_profile_id: ref.profile_id,
    context_profile_hash: ref.profile_hash, context_funding_policy_hash: ref.funding_policy_hash,
    context_wallet_assignment_id: ref.wallet_assignment_id,
    context_wallet_assignment_revision: ref.wallet_assignment_revision,
    context_lifecycle_revision: ref.lifecycle_revision, expected_terms_kind: quote.kind,
    expected_terms_hash: quote.kind === "prospective" ? quote.prospective_terms_hash : quote.committed_terms_hash,
  });
}

/** Uses generated paths only, never server-provided hrefs. Journaling, grants and
 * signing remain explicit controller actions; this transport never resends a POST. */
export function createSongContributionApi(options: {
  readonly scope: SongContributionScope;
  readonly currentScope: () => SongContributionScope | null;
  readonly client?: Pick<PirateApiClient, Operation | "get_usersMe">;
  readonly csrf?: () => string | undefined;
}) {
  const scope = Object.freeze({ ...options.scope });
  const path = Object.freeze({ communityId: scope.communityId, postId: scope.postId });
  const client = options.client ?? createSessionApiClient();
  const assertCurrent = (signal: AbortSignal) => {
    if (signal.aborted) throw new DOMException("Contribution request aborted", "AbortError");
    const current = options.currentScope();
    if (!current || current.accountId !== scope.accountId || current.personaId !== scope.personaId || current.communityId !== scope.communityId || current.postId !== scope.postId) throw new Error("contribution_scope_changed");
  };
  const assertTarget = (target: { readonly community_id: string; readonly post_id: string }) => {
    if (target.community_id !== scope.communityId || target.post_id !== scope.postId) throw new Error("contribution_target_mismatch");
  };
  const assertReceipt = (receipt: SongContributionReceipt) => {
    assertTarget(receipt.target);
    if (receipt.persona_id !== scope.personaId || receipt.terms_hash !== receipt.committed_terms.terms_hash || receipt.reservation.amount_atomic !== receipt.instruction.amount_atomic) throw new Error("contribution_receipt_mismatch");
  };
  const account = async (signal: AbortSignal) => {
    assertCurrent(signal);
    const me = await client.get_usersMe(undefined, { signal });
    assertCurrent(signal);
    if (me.id !== scope.accountId) throw new Error("contribution_account_changed");
  };
  const checked = async <T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> => {
    await account(signal);
    const value = await operation();
    // A post-write identity failure is an uncertain outcome, never proof of no effect.
    await account(signal);
    return value;
  };
  const writeOptions = (signal: AbortSignal) => {
    assertCurrent(signal);
    const token = (options.csrf ?? readCsrfCookie)();
    if (!token) throw new Error("contribution_csrf_unavailable");
    return sessionRequestOptions(token, { signal });
  };
  const contributionPath = (contributionId: string) => ({ ...path, contributionId });
  const assertContribution = (expected: string, actual: string) => {
    if (expected !== actual) throw new Error("contribution_target_mismatch");
  };
  return {
    async context(signal: AbortSignal): Promise<SongContributionContext> {
      const value = await checked(signal, () => client.get_communitiesCommunityIdPostsPostIdMegapotFundingContext({ path, query: { persona_id: scope.personaId } }, { signal }));
      assertTarget(value.target);
      if (value.readiness === "ready") {
        if (value.actor.account_id !== scope.accountId || value.actor.persona_id !== scope.personaId || value.actor.community_id !== scope.communityId || value.actor.wallet_assignment_id !== value.context_ref.wallet_assignment_id) throw new Error("contribution_context_mismatch");
      } else if (value.persona_id !== scope.personaId) throw new Error("contribution_context_mismatch");
      return value;
    },
    async create(body: SongContributionRequest, signal: AbortSignal): Promise<SongContributionReceipt> {
      const request = Object.freeze({ ...body }), requestOptions = writeOptions(signal);
      if (request.persona_id !== scope.personaId) throw new Error("contribution_scope_changed");
      const value = await checked(signal, () => client.post_communitiesCommunityIdPostsPostIdMegapotContributions({ path, body: request }, requestOptions));
      assertReceipt(value);
      if (value.idempotency_key !== request.idempotency_key || value.accepted_context_hash !== request.expected_context_hash || value.instruction.amount_atomic !== request.funding_amount_atomic || value.instruction.wallet_assignment_id !== request.context_wallet_assignment_id || (request.expected_terms_kind === "prospective" ? value.accepted_prospective_terms_hash !== request.expected_terms_hash : value.terms_hash !== request.expected_terms_hash)) throw new Error("contribution_receipt_mismatch");
      return value;
    },
    async state(contributionId: string, signal: AbortSignal): Promise<SongContributionState> {
      const value = await checked(signal, () => client.get_communitiesCommunityIdPostsPostIdMegapotContributionsContributionId({ path: contributionPath(contributionId) }, { signal }));
      assertContribution(contributionId, value.contribution_id); assertTarget(value.target); assertReceipt(value.command_receipt);
      const original = value.command_receipt;
      const targetFields = ["community_id", "post_id", "canonical_song_id", "audio_revision", "kind", "offer_id", "pool_leg_id"] as const;
      if (original.contribution_id !== value.contribution_id || original.funding_effect_id !== value.funding_effect_id || targetFields.some(key => original.target[key] !== value.target[key]) || value.original_persona_id !== scope.personaId || value.original_sender !== original.instruction.from || value.terms_hash !== original.terms_hash || value.instruction_hash !== original.instruction.instruction_hash) throw new Error("contribution_receipt_mismatch");
      return value;
    },
    async command(operation: SongContributionCommand, idempotencyKey: string, signal: AbortSignal, contributionId?: string): Promise<Reply<CommandOp> | null> {
      if (operation !== "CreateSongMegapotContributionV2" && contributionId === undefined) throw new Error("contribution_original_target_required");
      try {
        const value = await checked(signal, () => client.get_communitiesCommunityIdPostsPostIdMegapotContributionCommandsOperationIdempotencyKey({ path: { ...path, operation, idempotencyKey } }, { signal }));
        if (value.object !== commandObjects[operation]) throw new Error("contribution_command_mismatch");
        if (contributionId !== undefined) assertContribution(contributionId, value.contribution_id);
        if (value.object === "song_megapot_contribution_command_receipt") { assertReceipt(value); if (value.idempotency_key !== idempotencyKey) throw new Error("contribution_command_mismatch"); }
        return value;
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404 && error.declaredName === "ContributionNotFoundV2") {
          // A miss under a replacement cookie cannot release an old account's journal.
          await account(signal);
          return null;
        }
        throw error;
      }
    },
    async claim(contributionId: string, body: SongContributionClaim, signal: AbortSignal): Promise<Reply<ClaimOp>> {
      const request = Object.freeze({ ...body }), requestOptions = writeOptions(signal);
      const value = await checked(signal, () => client.post_communitiesCommunityIdPostsPostIdMegapotContributionsContributionIdSubmissionClaims({ path: contributionPath(contributionId), body: request }, requestOptions));
      assertContribution(contributionId, value.receipt.contribution_id);
      if (value.receipt.instruction_hash !== request.instruction_hash || value.receipt.purpose !== request.purpose || value.receipt.holder_client_instance_id !== request.client_instance_id || value.receipt.submission_attempt_id !== request.submission_attempt_id) throw new Error("contribution_claim_mismatch");
      return value;
    },
    async observe(contributionId: string, body: SongContributionObservation, signal: AbortSignal): Promise<Reply<ObserveOp>> {
      const request = Object.freeze({ ...body }), requestOptions = writeOptions(signal);
      const value = await checked(signal, () => client.post_communitiesCommunityIdPostsPostIdMegapotContributionsContributionIdObservations({ path: contributionPath(contributionId), body: request }, requestOptions));
      assertContribution(contributionId, value.contribution_id);
      if (value.accepted_candidate_hash !== request.transaction_hash) throw new Error("contribution_observation_mismatch");
      return value;
    },
    async recover(contributionId: string, body: SongContributionRecovery, signal: AbortSignal): Promise<Reply<RecoverOp>> {
      const request = Object.freeze({ ...body }), requestOptions = writeOptions(signal);
      const value = await checked(signal, () => client.post_communitiesCommunityIdPostsPostIdMegapotContributionsContributionIdRecoveries({ path: contributionPath(contributionId), body: request }, requestOptions));
      assertContribution(contributionId, value.contribution_id);
      return value;
    },
    async cancellation(contributionId: string, body: SongContributionCancellation, signal: AbortSignal): Promise<Reply<CancelOp>> {
      const request = Object.freeze({ ...body }), requestOptions = writeOptions(signal);
      const value = await checked(signal, () => client.post_communitiesCommunityIdPostsPostIdMegapotContributionsContributionIdCancellationPreparations({ path: contributionPath(contributionId), body: request }, requestOptions));
      assertContribution(contributionId, value.contribution_id);
      if (value.sender !== value.recipient) throw new Error("contribution_cancellation_mismatch");
      return value;
    },
  };
}

export type SongContributionApi = ReturnType<typeof createSongContributionApi>;
