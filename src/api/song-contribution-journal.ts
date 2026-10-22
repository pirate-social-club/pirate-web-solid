import {
  decodeContributionCommand, decodeJournalRecord, encodeContributionCommand,
  journalChoice, journalCommandKey, journalHash, journalIdentifier, journalInteger, journalLiteral,
  journalTransactionHash, parseJournalJson, type ContributionCommandBody,
  type JournalJson, type JournalRule, type JournalFields,
} from "./contribution-command-codec.ts";
import type { SongContributionApi, SongContributionCommand, SongContributionReceipt, SongContributionScope, SongContributionState } from "./song-contributions.ts";

export interface ContributionJournalStore {
  read(key: string): string | null;
  write(key: string, raw: string): void;
  remove(key: string): void;
  exclusive<T>(key: string, operation: () => Promise<T>): Promise<T>;
}
export interface StoredContributionCommand {
  readonly operation: SongContributionCommand;
  readonly contributionId: string | null;
  /** Exact original command bytes; never reconstructed from a refreshed quote. */
  readonly bodyJson: string;
  readonly requestHash: string | null;
}
export interface ContributionWalletInvocation {
  readonly claimKey: string;
  readonly grantId: string;
  readonly purpose: "funding_transfer" | "nonce_cancellation";
  readonly instructionHash: string;
  readonly transactionHash: string | null;
}
export interface ContributionJournalEntry extends SongContributionScope {
  readonly version: 1;
  readonly revision: number;
  readonly clientInstanceId: string;
  readonly contributionId: string | null;
  readonly commands: readonly StoredContributionCommand[];
  /** Presence means the wallet may have been invoked. No fresh grant is stored. */
  readonly invocations: readonly ContributionWalletInvocation[];
}

const corrupt = () => new Error("contribution_journal_corrupt");
const nullable = (rule: JournalRule<string>): JournalRule<string | null> => (value): value is string | null => value === null || rule(value);
const text: JournalRule<string> = (value): value is string => typeof value === "string";
const operation = journalChoice(["CreateSongMegapotContributionV2", "ClaimSongMegapotContributionSubmissionV2", "ObserveSongMegapotContributionV2", "RecoverSongMegapotContributionV2", "PrepareSongMegapotContributionCancellationV2"]);
const commandFields = { operation, contributionId: nullable(journalIdentifier), bodyJson: text, requestHash: nullable(journalHash) } satisfies JournalFields<StoredContributionCommand>;
const invocationFields = { claimKey: journalCommandKey, grantId: journalIdentifier, purpose: journalChoice(["funding_transfer", "nonce_cancellation"]), instructionHash: journalHash, transactionHash: nullable(journalTransactionHash) } satisfies JournalFields<ContributionWalletInvocation>;
const commands: JournalRule<readonly StoredContributionCommand[]> = (value): value is readonly StoredContributionCommand[] & JournalJson => {
  if (!Array.isArray(value)) return false;
  try { for (const item of value) { const command = decodeJournalRecord<StoredContributionCommand>(item, commandFields); decodeContributionCommand(command.operation, command.bodyJson); } return true; } catch { return false; }
};
const invocations: JournalRule<readonly ContributionWalletInvocation[]> = (value): value is readonly ContributionWalletInvocation[] & JournalJson => {
  if (!Array.isArray(value)) return false;
  try { for (const item of value) decodeJournalRecord<ContributionWalletInvocation>(item, invocationFields); return true; } catch { return false; }
};
const entryFields = {
  version: journalLiteral(1), revision: journalInteger, accountId: journalIdentifier,
  personaId: journalIdentifier, communityId: journalIdentifier, postId: journalIdentifier,
  clientInstanceId: journalCommandKey, contributionId: nullable(journalIdentifier), commands, invocations,
} satisfies JournalFields<ContributionJournalEntry>;

export const contributionJournalKey = (scope: SongContributionScope) =>
  `pirate:shared-song-contribution:v2:${JSON.stringify([scope.accountId, scope.personaId, scope.communityId, scope.postId])}`;

export function decodeContributionJournal(raw: string, scope: SongContributionScope): ContributionJournalEntry {
  const entry = decodeJournalRecord<ContributionJournalEntry>(parseJournalJson(raw), entryFields);
  if (contributionJournalKey(entry) !== contributionJournalKey(scope) || entry.commands.length === 0) throw corrupt();
  const parsed = entry.commands.map(command => decodeContributionCommand(command.operation, command.bodyJson));
  const first = parsed[0];
  if (!first || first.operation !== "CreateSongMegapotContributionV2" || first.body.persona_id !== scope.personaId || entry.commands[0]?.contributionId !== null) throw corrupt();
  if (new Set(parsed.map(command => command.body.idempotency_key)).size !== parsed.length) throw corrupt();
  for (const [index, command] of parsed.entries()) {
    if (index > 0 && (command.operation === "CreateSongMegapotContributionV2" || entry.contributionId === null || entry.commands[index]?.contributionId !== entry.contributionId)) throw corrupt();
    if (command.operation === "ClaimSongMegapotContributionSubmissionV2" && command.body.client_instance_id !== entry.clientInstanceId) throw corrupt();
  }
  if (new Set(entry.invocations.map(invocation => invocation.claimKey)).size !== entry.invocations.length) throw corrupt();
  const invokedPurposes = new Set<ContributionWalletInvocation["purpose"]>();
  for (const invocation of entry.invocations) {
    if (invokedPurposes.has(invocation.purpose) || invocation.purpose === "funding_transfer" && invokedPurposes.has("nonce_cancellation")) throw corrupt();
    invokedPurposes.add(invocation.purpose);
    const claim = parsed.find(command => command.body.idempotency_key === invocation.claimKey);
    if (!claim || claim.operation !== "ClaimSongMegapotContributionSubmissionV2" || claim.body.purpose !== invocation.purpose || claim.body.instruction_hash !== invocation.instructionHash) throw corrupt();
  }
  return entry;
}

/** All mutation happens while the actor/song Web Lock is held. Returned views
 * are copies; retaining a handle beyond the callback cannot mutate the journal. */
export function createSongContributionJournal(options: {
  readonly scope: SongContributionScope;
  readonly currentScope: () => SongContributionScope | null;
  readonly store: ContributionJournalStore;
  readonly nowMs?: () => number;
}) {
  const scope = Object.freeze({ ...options.scope }), key = contributionJournalKey(scope), store = options.store;
  const current = () => { const value = options.currentScope(); if (!value || contributionJournalKey(value) !== key) throw new Error("contribution_scope_changed"); };
  const read = () => { current(); const raw = store.read(key); return raw === null ? null : decodeContributionJournal(raw, scope); };
  return {
    read,
    async exclusive<T>(use: (handle: {
      read(): ContributionJournalEntry | null;
      initialize(command: Extract<ContributionCommandBody, { readonly operation: "CreateSongMegapotContributionV2" }>, clientInstanceId: string): ContributionJournalEntry;
      append(command: ContributionCommandBody, contributionId: string): ContributionJournalEntry;
      acknowledge(commandKey: string, requestHash: string, receipt?: SongContributionReceipt): ContributionJournalEntry;
      beforeWallet(claimKey: string, delivery: Awaited<ReturnType<SongContributionApi["claim"]>>): ContributionJournalEntry;
      recordTransaction(claimKey: string, transactionHash: string): ContributionJournalEntry;
      archive(state: SongContributionState): void;
    }) => Promise<T>): Promise<T> {
      current();
      return store.exclusive(key, async () => {
        let active = true;
        const live = () => { current(); if (!active) throw new Error("contribution_journal_lease_closed"); };
        const load = () => { live(); return read(); };
        const required = () => { const entry = load(); if (!entry) throw new Error("contribution_journal_missing"); return entry; };
        const save = (before: ContributionJournalEntry | null, next: ContributionJournalEntry) => {
          live(); const existing = store.read(key);
          if ((before === null) !== (existing === null) || (before && existing && JSON.stringify(decodeContributionJournal(existing, scope)) !== JSON.stringify(before))) throw new Error("contribution_journal_changed");
          const raw = JSON.stringify(next); decodeContributionJournal(raw, scope); store.write(key, raw);
          if (store.read(key) !== raw) throw new Error("contribution_journal_unavailable");
          return decodeContributionJournal(raw, scope);
        };
        const revise = (entry: ContributionJournalEntry, change: Partial<ContributionJournalEntry>) => save(entry, { ...entry, ...change, revision: entry.revision + 1 });
        try {
          return await use({
            read: load,
            initialize(command, clientInstanceId) {
              live(); if (load()) throw new Error("contribution_journal_pending");
              return save(null, { ...scope, version: 1, revision: 0, clientInstanceId, contributionId: null, commands: [{ operation: command.operation, contributionId: null, bodyJson: encodeContributionCommand(command), requestHash: null }], invocations: [] });
            },
            append(command, contributionId) {
              const entry = required();
              if (command.operation === "CreateSongMegapotContributionV2" || entry.contributionId !== contributionId) throw new Error("contribution_original_target_required");
              return revise(entry, { commands: [...entry.commands, { operation: command.operation, contributionId, bodyJson: encodeContributionCommand(command), requestHash: null }] });
            },
            acknowledge(commandKey, requestHash, receipt) {
              const entry = required(); let found = false; let selected: ContributionCommandBody | undefined;
              const commands = entry.commands.map(command => {
                const original = decodeContributionCommand(command.operation, command.bodyJson);
                if (original.body.idempotency_key !== commandKey) return command;
                found = true;
                selected = original;
                if (command.requestHash !== null && command.requestHash !== requestHash) throw new Error("contribution_command_mismatch");
                return { ...command, requestHash };
              });
              if (!found) throw new Error("contribution_command_mismatch");
              if (receipt) {
                if (!selected || selected.operation !== "CreateSongMegapotContributionV2") throw new Error("contribution_receipt_mismatch");
                const body = selected.body;
                if (receipt.idempotency_key !== commandKey || receipt.request_hash !== requestHash || receipt.persona_id !== scope.personaId || receipt.target.community_id !== scope.communityId || receipt.target.post_id !== scope.postId || receipt.accepted_context_hash !== body.expected_context_hash || receipt.instruction.amount_atomic !== body.funding_amount_atomic || receipt.instruction.wallet_assignment_id !== body.context_wallet_assignment_id || (body.expected_terms_kind === "prospective" ? receipt.accepted_prospective_terms_hash !== body.expected_terms_hash : receipt.terms_hash !== body.expected_terms_hash) || (entry.contributionId !== null && entry.contributionId !== receipt.contribution_id)) throw new Error("contribution_receipt_mismatch");
              }
              return revise(entry, { commands, contributionId: receipt?.contribution_id ?? entry.contributionId });
            },
            beforeWallet(claimKey, delivery) {
              const entry = required(), receipt = delivery.receipt;
              if (delivery.delivery.kind !== "fresh_grant" || delivery.delivery.replayed || entry.invocations.some(invocation => invocation.claimKey === claimKey || invocation.purpose === receipt.purpose || receipt.purpose === "funding_transfer" && invocation.purpose === "nonce_cancellation")) throw new Error("contribution_wallet_invocation_forbidden");
              const stored = entry.commands.find(command => decodeContributionCommand(command.operation, command.bodyJson).body.idempotency_key === claimKey);
              const claim = stored && decodeContributionCommand(stored.operation, stored.bodyJson);
              const now = (options.nowMs ?? Date.now)();
              if (!stored || !claim || claim.operation !== "ClaimSongMegapotContributionSubmissionV2" || stored.requestHash !== receipt.request_hash || claim.body.submission_attempt_id !== receipt.submission_attempt_id || receipt.contribution_id !== entry.contributionId || receipt.holder_client_instance_id !== entry.clientInstanceId || !Number.isFinite(now) || Date.parse(receipt.claimed_at) > now || !(Date.parse(receipt.valid_until) > now)) throw new Error("contribution_claim_mismatch");
              return revise(entry, { invocations: [...entry.invocations, { claimKey, grantId: receipt.grant_id, purpose: receipt.purpose, instructionHash: receipt.instruction_hash, transactionHash: null }] });
            },
            recordTransaction(claimKey, transactionHash) {
              const entry = required(); let found = false;
              const invocations = entry.invocations.map(invocation => {
                if (invocation.claimKey !== claimKey) return invocation;
                found = true;
                if (invocation.transactionHash !== null && invocation.transactionHash !== transactionHash) throw new Error("contribution_transaction_mismatch");
                return { ...invocation, transactionHash };
              });
              if (!found) throw new Error("contribution_wallet_invocation_forbidden");
              return revise(entry, { invocations });
            },
            archive(state) {
              const entry = required(), first = decodeContributionCommand(entry.commands[0]!.operation, entry.commands[0]!.bodyJson);
              const receipt = state.command_receipt;
              const targetFields = ["community_id", "post_id", "canonical_song_id", "audio_revision", "kind", "offer_id", "pool_leg_id"] as const;
              if (first.operation !== "CreateSongMegapotContributionV2" || state.contribution_id !== entry.contributionId || receipt.contribution_id !== entry.contributionId || state.funding_effect_id !== receipt.funding_effect_id || receipt.idempotency_key !== first.body.idempotency_key || entry.commands[0]?.requestHash !== receipt.request_hash || state.original_persona_id !== scope.personaId || receipt.persona_id !== scope.personaId || state.target.community_id !== scope.communityId || state.target.post_id !== scope.postId || targetFields.some(field => receipt.target[field] !== state.target[field]) || state.instruction_hash !== receipt.instruction.instruction_hash || state.terms_hash !== receipt.terms_hash || state.original_sender !== receipt.instruction.from || !state.allowed_actions.includes("start_fresh_contribution") || state.nonce_state === "reserved_unknown" || state.nonce_state === "unresolved") throw new Error("contribution_resolution_unproven");
              const historyKey = `${key}:history:${first.body.idempotency_key}`, raw = JSON.stringify({ entry, serverState: state });
              const history = store.read(historyKey); if (history !== null && history !== raw) throw new Error("contribution_history_conflict");
              store.write(historyKey, raw); if (store.read(historyKey) !== raw) throw new Error("contribution_journal_unavailable");
              store.remove(key); if (store.read(key) !== null) throw new Error("contribution_journal_unavailable");
            },
          });
        } finally { active = false; }
      });
    },
  };
}

/** Stores command identifiers and requests only; never session or wallet tokens. */
export function createBrowserContributionJournalStore(): ContributionJournalStore {
  if (!("window" in globalThis) || !("navigator" in globalThis) || !navigator.locks) throw new Error("contribution_journal_unavailable");
  const storage = window.localStorage, locks = navigator.locks;
  return {
    read: key => storage.getItem(key), write: (key, raw) => storage.setItem(key, raw), remove: key => storage.removeItem(key),
    async exclusive<T>(key: string, operation: () => Promise<T>): Promise<T> { return await locks.request(key, { mode: "exclusive" }, operation); },
  };
}
