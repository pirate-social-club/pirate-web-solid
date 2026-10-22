import type { SongContributionWallet } from "../../api/song-contribution-wallet.ts";
import { createSongContributionController } from "../../api/song-contribution-controller.ts";
import { createSongContributionJournal, type ContributionJournalStore } from "../../api/song-contribution-journal.ts";
import { contributionFixtures as f } from "../../api/song-contributions.fixture.ts";
import type { SongContributionApi, SongContributionScope, SongContributionState } from "../../api/song-contributions.ts";
import type { SongContributionAuthorization, SongContributionDependencies } from "./song-contribution-dialog.tsx";
import { rewardCreationKey } from "../../api/reward-creation.ts";

// Deterministic application-command projections, not provider, nonce-finality,
// database or financial acceptance. Real transport decoding has its own tests.
export function createSongContributionFixture() {
  const values = new Map<string, string>(), tails = new Map<string, Promise<void>>();
  const receipts = new Map<string, NonNullable<Awaited<ReturnType<SongContributionApi["command"]>>>>();
  let currentScope: SongContributionScope | null = f.scope, clock = Date.parse("2026-10-18T13:00:20.000Z"), sequence = 0;
  let current: SongContributionState = { ...f.current, allowed_actions: ["claim_funding_submission", "observe_original", "recover_original", "prepare_nonce_cancellation", "wait"] };
  let creation: "ok" | "before" | "after" = "ok", claim: "ok" | "after" | "replayed" = "ok", walletResult: "ok" | "unknown" = "ok", observationLost = false;
  const store: ContributionJournalStore = {
    read: key => values.get(key) ?? null, write: (key, raw) => { values.set(key, raw); }, remove: key => { values.delete(key); },
    async exclusive<T>(key: string, operation: () => Promise<T>) {
      const previous = tails.get(key) ?? Promise.resolve(); let release = () => {};
      const next = new Promise<void>(done => { release = done; }); tails.set(key, previous.then(() => next));
      await previous; try { return await operation(); } finally { release(); }
    },
  };
  const journal = () => createSongContributionJournal({ scope: f.scope, currentScope: () => currentScope, store, nowMs: () => clock });
  const api: SongContributionApi = {
    context: (async () => f.context),
    command: (async (_operation, key) => receipts.get(key) ?? null),
    create: (async body => {
      if (journal().read()?.commands[0]?.bodyJson !== JSON.stringify(body)) throw new Error("fixture_original_request_not_persisted");
      if (creation === "before") throw new Error("response_lost_before_commit");
      const receipt = { ...f.receipt, idempotency_key: body.idempotency_key };
      receipts.set(body.idempotency_key, receipt); current = { ...current, command_receipt: receipt };
      if (creation === "after") throw new Error("response_lost_after_commit");
      return receipt;
    }),
    state: (async () => current),
    claim: (async (_id, body) => {
      const receipt = { ...f.claim.receipt, purpose: body.purpose, instruction_hash: body.instruction_hash,
        holder_client_instance_id: body.client_instance_id, submission_attempt_id: body.submission_attempt_id,
        claimed_at: new Date(clock).toISOString(), valid_until: new Date(clock + 60_000).toISOString(),
        cancellation_preparation_id: body.purpose === "nonce_cancellation" ? f.cancellation.preparation_id : null,
        cancellation_preparation_revision: body.purpose === "nonce_cancellation" ? f.cancellation.preparation_revision : null,
      };
      receipts.set(body.idempotency_key, receipt);
      current = { ...current, revision: current.revision + 1, state: "submission_claimed", allowed_actions: ["observe_original", "recover_original", "prepare_nonce_cancellation", "wait"], submissions: [{ state: "claimed", purpose: receipt.purpose, grant_id: receipt.grant_id, grant_revision: receipt.grant_revision, holder_client_instance_id: receipt.holder_client_instance_id, submission_attempt_id: receipt.submission_attempt_id, valid_until: receipt.valid_until, cancellation_preparation_id: receipt.cancellation_preparation_id, cancellation_preparation_revision: receipt.cancellation_preparation_revision }] };
      if (claim === "after") throw new Error("claim_response_lost");
      return { receipt, delivery: claim === "replayed" ? { kind: "recovery_only", replayed: true } : { kind: "fresh_grant", replayed: false } };
    }),
    observe: (async (_id, body) => {
      const receipt = { ...f.observation, accepted_candidate_hash: body.transaction_hash };
      receipts.set(body.idempotency_key, receipt); current = { ...current, revision: current.revision + 1, state: "confirming" };
      if (observationLost) throw new Error("observation_response_lost");
      return receipt;
    }),
    recover: (async (_id, body) => { receipts.set(body.idempotency_key, f.recovery); return f.recovery; }),
    cancellation: (async (_id, body) => {
      receipts.set(body.idempotency_key, f.cancellation);
      current = { ...current, revision: current.revision + 1, allowed_actions: ["claim_nonce_cancellation", "observe_original", "recover_original", "wait"], cancellation: { ...current.cancellation, state: "prepared", current_preparation_id: f.cancellation.preparation_id, current_preparation_revision: f.cancellation.preparation_revision, current_receipt: f.cancellation } };
      return f.cancellation;
    }),
  };
  const fee = { gasLimit: "21000", gasPriceAtomic: "2", executionFeeAtomic: "42000" };
  let beforeWallet: (() => void) | undefined, walletInvocations = 0;
  const wallet: SongContributionWallet = {
    estimate: (async () => fee),
    send: (async (_original, _fee, before: () => Promise<void>) => {
      beforeWallet?.(); await before();
      if (journal().read()?.invocations.length !== walletInvocations + 1) throw new Error("fixture_wallet_marker_not_persisted"); walletInvocations++;
      if (walletResult === "unknown") throw new Error("wallet_submission_uncertain");
      return f.observationRequest.transaction_hash;
    }), dispose: () => {},
  };
  const controller = () => createSongContributionController({ scope: f.scope, currentScope: () => currentScope, journal: journal(), api, wallet, nowMs: () => clock, key: () => `fixture_command_key_${String(++sequence).padStart(5, "0")}` });
  return { api, wallet, values, receipts, store, journal, controller, current: () => current,
    setCurrent: (value: SongContributionState) => { current = value; }, scope: (value: SongContributionScope | null) => { currentScope = value; },
    setCreation: (value: typeof creation) => { creation = value; }, setClaim: (value: typeof claim) => { claim = value; },
    setWallet: (value: typeof walletResult) => { walletResult = value; }, setObservationLost: () => { observationLost = true; },
    setClock: (value: string) => { clock = Date.parse(value); }, advance: (ms: number) => { clock += ms; },
    beforeWallet: (value: () => void) => { beforeWallet = value; }, nowMs: () => clock, walletInvocations: () => walletInvocations };
}

/** Fictional browser presentation of the same command fixture used by tests.
 * Its golden payment is exactly2 USDC; any email/code authorizes a simulated
 * wallet. This module is consumed only by stories and tests, never live UI. */
export function createContributionDialogFixture(fixture = createSongContributionFixture()): SongContributionDependencies {
  const authorization: SongContributionAuthorization = {
    sendCode: async () => {}, loginWithCode: async () => {},
    estimateTransfer: async () => fixture.wallet.estimate(fixture.current().command_receipt),
    estimateCancellation: async () => fixture.wallet.estimate(fixture.current().command_receipt),
    sendTransfer: async (_transfer, fee, before) => fixture.wallet.send(fixture.current().command_receipt, fee, before),
    sendCancellation: async (_transfer, fee, before) => fixture.wallet.send(fixture.current().command_receipt, fee, before, fixture.current().cancellation.current_receipt ?? undefined),
    dispose: () => fixture.wallet.dispose(),
  };
  return {
    catalog: async () => ({ accountId: f.scope.accountId, personas: [{
      object: "persona", persona_id: f.scope.personaId, status: "active",
      profile: { object: "persona_profile", persona_id: f.scope.personaId, revision: 1, display_name: "Fixture profile", avatar_ref: null, cover_ref: null, bio: null, preferred_locale: "en", primary_public_handle: null },
      wallet_set: { evm: { chain_account_kind: "evm", address: f.receipt.instruction.from, hd_wallet_index: 0, assigned_at: f.receipt.created_at } },
      community_binding: { community_id: f.scope.communityId, binding_source: "persona_creation" }, created_at: f.receipt.created_at, retired_at: null,
    }] }),
    api: () => fixture.api, journal: createSongContributionJournal, store: () => fixture.store,
    authorization: async () => authorization, previous: scope => fixture.store.read(rewardCreationKey(scope)) !== null, nowMs: fixture.nowMs,
  };
}
