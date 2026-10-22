import { decodeContributionCommand, type ContributionCommandBody } from "./contribution-command-codec.ts";
import { resolveContributionCommand, type ContributionJournal, type ContributionJournalHandle } from "./song-contribution-commands.ts";
import { contributionJournalKey, type ContributionJournalEntry, type StoredContributionCommand } from "./song-contribution-journal.ts";
import { contributionCancellationTransfer, type ContributionCancellationReceipt, type SongContributionWallet } from "./song-contribution-wallet.ts";
import { songContributionRequest, type SongContributionApi, type SongContributionContext, type SongContributionRequest, type SongContributionScope, type SongContributionState } from "./song-contributions.ts";
import type { RewardFeeEstimate } from "./reward-wallet-session.ts";

export type SongContributionView =
  | { readonly kind: "idle" }
  | { readonly kind: "amount"; readonly context: SongContributionContext }
  | { readonly kind: "terms"; readonly context: Extract<SongContributionContext, { readonly readiness: "ready" }>; readonly request: SongContributionRequest }
  | { readonly kind: "pending"; readonly entry: ContributionJournalEntry; readonly current: SongContributionState | null }
  | { readonly kind: "status"; readonly current: SongContributionState }
  | { readonly kind: "pay"; readonly reviewId: string; readonly current: SongContributionState; readonly fee: RewardFeeEstimate; readonly cancellation: ContributionCancellationReceipt | null };

/** One actor/song controller. Reload performs reads only; wallet dispatch requires
 * a new explicit confirmation, a fresh grant and durable pre-wallet storage. */
export function createSongContributionController(options: {
  readonly scope: SongContributionScope;
  readonly currentScope: () => SongContributionScope | null;
  readonly journal: ContributionJournal;
  readonly api: SongContributionApi;
  readonly wallet: SongContributionWallet;
  readonly nowMs?: () => number;
  readonly key?: () => string;
}) {
  const { journal, api, wallet } = options;
  const scopeKey = contributionJournalKey(options.scope), lifetime = new AbortController();
  const now = options.nowMs ?? Date.now, key = options.key ?? (() => crypto.randomUUID());
  let view: SongContributionView = { kind: "idle" }, busy = false;
  const current = () => { const selected = options.currentScope(); return !lifetime.signal.aborted && selected !== null && contributionJournalKey(selected) === scopeKey; };
  const assertCurrent = () => { if (!current()) throw new Error("contribution_scope_changed"); };
  const until = (expires: string) => { const clock = now(); if (!Number.isFinite(clock) || !(Date.parse(expires) > clock)) throw new Error("contribution_review_expired"); };
  const publish = (next: SongContributionView) => { assertCurrent(); view = next; return next; };
  const pendingCommand = (entry: ContributionJournalEntry) => entry.commands.find(command => command.requestHash === null);
  const stored = (handle: ContributionJournalHandle) => {
    const entry = handle.read(); if (!entry) throw new Error("contribution_journal_missing"); return entry;
  };
  const execute = (handle: ContributionJournalHandle, command: StoredContributionCommand, allowWrite: boolean) => resolveContributionCommand({ handle, stored: command, api, signal: lifetime.signal, allowWrite, assertCurrent });
  const append = (handle: ContributionJournalHandle, command: ContributionCommandBody) => {
    const entry = stored(handle);
    if (!entry.contributionId || pendingCommand(entry)) throw new Error("contribution_command_pending");
    const next = handle.append(command, entry.contributionId);
    return next.commands[next.commands.length - 1]!;
  };
  const state = async (handle: ContributionJournalHandle) => {
    const entry = stored(handle);
    if (!entry.contributionId) throw new Error("contribution_original_target_required");
    const result = await api.state(entry.contributionId, lifetime.signal); assertCurrent();
    const first = entry.commands[0]!;
    const original = decodeContributionCommand(first.operation, first.bodyJson);
    if (original.operation !== "CreateSongMegapotContributionV2") throw new Error("contribution_journal_corrupt");
    handle.acknowledge(original.body.idempotency_key, result.command_receipt.request_hash, result.command_receipt);
    return result;
  };
  const showStored = async (handle: ContributionJournalHandle) => {
    let entry = stored(handle);
    // A command acknowledgement may have been lost even though it committed.
    for (const command of entry.commands.filter(command => command.requestHash === null)) await execute(handle, command, false);
    entry = stored(handle);
    const result = entry.contributionId ? await state(handle) : null;
    if (!result || pendingCommand(stored(handle))) return publish({ kind: "pending", entry: stored(handle), current: result });
    return publish({ kind: "status", current: result });
  };
  const run = async (operation: () => Promise<SongContributionView>) => {
    assertCurrent(); if (busy) throw new Error("contribution_action_in_progress"); busy = true;
    try { return await operation(); }
    catch (error) {
      if (current()) { const entry = journal.read(); if (entry) view = { kind: "pending", entry, current: null }; }
      else view = { kind: "idle" };
      throw error;
    } finally { busy = false; }
  };
  const open = () => run(() => journal.exclusive(async handle => handle.read()
    ? showStored(handle)
    : publish({ kind: "amount", context: await api.context(lifetime.signal) })));
  const dispatchAllowed = (result: SongContributionState, cancellation: ContributionCancellationReceipt | null) => {
    if (!result.allowed_actions.includes(cancellation ? "claim_nonce_cancellation" : "claim_funding_submission") || result.pause_reason !== null || !["unresolved", "reserved_unknown"].includes(result.nonce_state)) throw new Error("contribution_submission_unavailable");
    if (!cancellation && result.submissions.some(submission => submission.purpose === "nonce_cancellation" && (submission.state === "claimed" || submission.state === "finalized"))) throw new Error("contribution_submission_unavailable");
    if (cancellation) {
      contributionCancellationTransfer(result.command_receipt, cancellation);
      if (result.cancellation.current_preparation_id !== cancellation.preparation_id || result.cancellation.current_preparation_revision !== cancellation.preparation_revision || result.cancellation.current_receipt?.instruction_hash !== cancellation.instruction_hash) throw new Error("contribution_cancellation_mismatch");
      until(cancellation.dispatch_expires_at); until(cancellation.recovery_attestation_valid_until);
    } else until(result.command_receipt.instruction.expires_at);
  };
  return {
    get state(): SongContributionView { return current() ? view : { kind: "idle" }; },
    open,
    refresh: open,
    reviewAmount(amountAtomic: string) {
      return run(() => journal.exclusive(async handle => {
        if (handle.read()) return showStored(handle);
        const context = await api.context(lifetime.signal); assertCurrent();
        if (context.readiness !== "ready") return publish({ kind: "amount", context });
        until(context.context_expires_at); until(context.schedule.valid_until);
        if (!/^[1-9][0-9]{0,77}$/u.test(amountAtomic)) throw new Error("contribution_amount_invalid");
        const amount = BigInt(amountAtomic);
        if (amount >= 2n ** 256n || amount < BigInt(context.limits.minimum_atomic) || amount > BigInt(context.limits.maximum_atomic) || amount > BigInt(context.limits.usable_capacity_atomic)) throw new Error("contribution_amount_invalid");
        return publish({ kind: "terms", context, request: songContributionRequest(context, amountAtomic, key()) });
      }));
    },
    reserve() {
      return run(() => journal.exclusive(async handle => {
        if (handle.read()) return showStored(handle);
        if (view.kind !== "terms") throw new Error("contribution_review_required");
        until(view.context.context_expires_at); until(view.context.schedule.valid_until);
        const entry = handle.initialize({ operation: "CreateSongMegapotContributionV2", body: view.request }, key());
        await execute(handle, entry.commands[0]!, true);
        return showStored(handle);
      }));
    },
    retryOriginalCommand() {
      return run(() => journal.exclusive(async handle => {
        const command = pendingCommand(stored(handle));
        if (command) await execute(handle, command, true);
        // Even a fresh claim returned on recovery is discarded, never signed.
        return showStored(handle);
      }));
    },
    preparePayment(cancellation = false) {
      return run(() => journal.exclusive(async handle => {
        if (pendingCommand(stored(handle))) return showStored(handle);
        const result = await state(handle), entry = stored(handle);
        const preparation = cancellation ? result.cancellation.current_receipt : null;
        if (cancellation && !preparation) throw new Error("contribution_cancellation_unprepared");
        const purpose = cancellation ? "nonce_cancellation" : "funding_transfer";
        if (entry.invocations.some(invocation => invocation.purpose === purpose) || entry.commands.some(command => { const parsed = decodeContributionCommand(command.operation, command.bodyJson); return parsed.operation === "ClaimSongMegapotContributionSubmissionV2" && parsed.body.purpose === purpose; })) throw new Error("contribution_original_submission_pending");
        dispatchAllowed(result, preparation);
        const fee = await wallet.estimate(result.command_receipt, preparation ?? undefined); assertCurrent();
        dispatchAllowed(result, preparation);
        return publish({ kind: "pay", reviewId: key(), current: result, fee, cancellation: preparation });
      }));
    },
    confirmPayment(reviewId: string) {
      return run(() => journal.exclusive(async handle => {
        if (view.kind !== "pay" || view.reviewId !== reviewId) throw new Error("contribution_review_required");
        const review = view, fresh = await state(handle), entry = stored(handle);
        if (fresh.revision !== review.current.revision || JSON.stringify(fresh.command_receipt) !== JSON.stringify(review.current.command_receipt)) throw new Error("contribution_review_changed");
        dispatchAllowed(fresh, review.cancellation);
        const claim = { operation: "ClaimSongMegapotContributionSubmissionV2", body: {
          idempotency_key: key(), client_instance_id: entry.clientInstanceId, submission_attempt_id: key(),
          purpose: review.cancellation ? "nonce_cancellation" as const : "funding_transfer" as const,
          expected_state_revision: fresh.revision, instruction_hash: review.cancellation?.instruction_hash ?? fresh.instruction_hash,
        } } as const;
        const response = await execute(handle, append(handle, claim), true);
        if (!response?.freshClaim) return showStored(handle);
        const delivery = response.freshClaim;
        const transactionHash = await wallet.send(fresh.command_receipt, review.fee, async () => {
          const latest = await state(handle); assertCurrent();
          if (JSON.stringify(latest.command_receipt) !== JSON.stringify(fresh.command_receipt) || latest.pause_reason !== null || !["unresolved", "reserved_unknown"].includes(latest.nonce_state)) throw new Error("contribution_submission_unavailable");
          if (claim.body.purpose === "funding_transfer" && latest.submissions.some(submission => submission.purpose === "nonce_cancellation" && (submission.state === "claimed" || submission.state === "finalized"))) throw new Error("contribution_submission_unavailable");
          const grant = latest.submissions.find(submission => submission.grant_id === delivery.receipt.grant_id);
          if (!grant || grant.state !== "claimed" || grant.purpose !== claim.body.purpose || grant.holder_client_instance_id !== entry.clientInstanceId || grant.submission_attempt_id !== claim.body.submission_attempt_id || grant.valid_until !== delivery.receipt.valid_until || grant.cancellation_preparation_id !== delivery.receipt.cancellation_preparation_id || grant.cancellation_preparation_revision !== delivery.receipt.cancellation_preparation_revision) throw new Error("contribution_claim_mismatch");
          if (review.cancellation) {
            if (latest.cancellation.current_preparation_id !== review.cancellation.preparation_id || latest.cancellation.current_preparation_revision !== review.cancellation.preparation_revision || latest.cancellation.current_receipt?.instruction_hash !== review.cancellation.instruction_hash) throw new Error("contribution_cancellation_mismatch");
            until(review.cancellation.dispatch_expires_at); until(review.cancellation.recovery_attestation_valid_until);
          }
          else until(latest.command_receipt.instruction.expires_at);
          handle.beforeWallet(claim.body.idempotency_key, delivery);
        }, review.cancellation ?? undefined);
        assertCurrent(); handle.recordTransaction(claim.body.idempotency_key, transactionHash);
        const observation = append(handle, { operation: "ObserveSongMegapotContributionV2", body: { idempotency_key: key(), instruction_hash: claim.body.instruction_hash, transaction_hash: transactionHash } });
        await execute(handle, observation, true);
        return showStored(handle);
      }));
    },
    observeOriginal(transactionHash: string, purpose: "funding_transfer" | "nonce_cancellation" = "funding_transfer") {
      return run(() => journal.exclusive(async handle => {
        const result = await state(handle);
        if (!result.allowed_actions.includes("observe_original")) throw new Error("contribution_observation_unavailable");
        const cancellation = purpose === "nonce_cancellation" ? result.cancellation.current_receipt : null;
        if (purpose === "nonce_cancellation" && !cancellation) throw new Error("contribution_cancellation_unprepared");
        if (cancellation) contributionCancellationTransfer(result.command_receipt, cancellation);
        const command = append(handle, { operation: "ObserveSongMegapotContributionV2", body: { idempotency_key: key(), instruction_hash: cancellation?.instruction_hash ?? result.instruction_hash, transaction_hash: transactionHash } });
        await execute(handle, command, true); return showStored(handle);
      }));
    },
    recoverOriginal() {
      return run(() => journal.exclusive(async handle => {
        const result = await state(handle);
        if (!result.allowed_actions.includes("recover_original")) throw new Error("contribution_recovery_unavailable");
        const command = append(handle, { operation: "RecoverSongMegapotContributionV2", body: { idempotency_key: key(), expected_state_revision: result.revision, purpose: "reconcile_original" } });
        await execute(handle, command, true); return showStored(handle);
      }));
    },
    prepareCancellation() {
      return run(() => journal.exclusive(async handle => {
        const result = await state(handle);
        if (!result.allowed_actions.includes("prepare_nonce_cancellation")) throw new Error("contribution_cancellation_unavailable");
        const command = append(handle, { operation: "PrepareSongMegapotContributionCancellationV2", body: { idempotency_key: key(), expected_state_revision: result.revision, purpose: "cancel_original_nonce" } });
        const response = await execute(handle, command, true);
        if (response?.receipt.object === "contribution_cancellation_command_receipt") contributionCancellationTransfer(result.command_receipt, response.receipt);
        return showStored(handle);
      }));
    },
    startFresh() {
      return run(() => journal.exclusive(async handle => {
        handle.archive(await state(handle));
        return publish({ kind: "amount", context: await api.context(lifetime.signal) });
      }));
    },
    dispose() { lifetime.abort(); view = { kind: "idle" }; wallet.dispose(); },
  };
}
