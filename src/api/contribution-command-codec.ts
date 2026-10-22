import type { SongContributionCancellation, SongContributionClaim, SongContributionCommand, SongContributionObservation, SongContributionRecovery, SongContributionRequest } from "./song-contributions.ts";

export type JournalJson = null | boolean | number | string | readonly JournalJson[] | { readonly [key: string]: JournalJson };
type Json = JournalJson;
export type JournalRule<T> = (value: Json | undefined) => value is T & Json;
type Rule<T> = JournalRule<T>;
export type JournalFields<T> = { readonly [K in keyof T]-?: Rule<T[K]> };
type Fields<T> = JournalFields<T>;
const corrupt = () => new Error("contribution_journal_corrupt");
export const journalLiteral = <const T extends string | number | boolean | null>(expected: T): Rule<T> => (value): value is T => value === expected;
const literal = journalLiteral;
export const journalChoice = <const T extends readonly string[]>(values: T): Rule<T[number]> => (value): value is T[number] => typeof value === "string" && values.some(item => item === value);
const choice = journalChoice;
export const journalIdentifier: Rule<string> = (value): value is string => typeof value === "string" && value.length > 0 && value.length <= 128 && value.trim() === value && Array.from(value).every(character => { const code = character.charCodeAt(0); return code >= 32 && (code < 127 || code > 159); });
const key: Rule<string> = (value): value is string => journalIdentifier(value) && /^[A-Za-z0-9_-]{16,128}$/u.test(value);
export const journalCommandKey = key;
export const journalInteger: Rule<number> = (value): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const integer = journalInteger;
export const journalHash: Rule<string> = (value): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
export const journalTransactionHash: Rule<string> = (value): value is string => typeof value === "string" && /^0x[a-f0-9]{64}$/u.test(value);
const amount: Rule<string> = (value): value is string => typeof value === "string" && /^[1-9][0-9]{0,77}$/u.test(value) && BigInt(value) < 2n ** 256n;

export function parseJournalJson(raw: string): Json {
  try {
    // SAFETY: the native JSON parser produces only JSON value representations;
    // exact keys and every consumed value are validated by the selected fields.
    return JSON.parse(raw) as Json;
  } catch { throw corrupt(); }
}

export function decodeJournalRecord<T extends object>(value: Json, rules: Fields<T>): T {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw corrupt();
  // SAFETY: JSON objects have string keys and JSON values; arrays were excluded.
  const fields = value as { readonly [key: string]: Json };
  const names = Object.keys(rules);
  if (Object.keys(fields).length !== names.length) throw corrupt();
  for (const name of names) {
    // SAFETY: these keys come from the statically complete mapped fields itself.
    const rule = rules[name as keyof T];
    if (!Object.hasOwn(fields, name) || !rule(fields[name])) throw corrupt();
  }
  // SAFETY: the complete mapped fields checked every required field and rejects
  // excess fields. These command bodies are flat scalar objects.
  return Object.freeze({ ...fields }) as T;
}
const fields = decodeJournalRecord;

const createFields = {
  version: literal(2), idempotency_key: key, persona_id: journalIdentifier,
  funding_amount_atomic: amount, expected_context_hash: journalHash,
  expected_lifecycle_revision: integer, context_version: literal("funding-context-reference-v1"),
  context_slot_id: journalIdentifier, context_slot_generation: integer,
  context_leg_snapshot_id: (value): value is string => value === "" || journalIdentifier(value),
  context_schedule_witness_id: journalIdentifier, context_profile_id: journalIdentifier,
  context_profile_hash: journalHash, context_funding_policy_hash: journalHash,
  context_wallet_assignment_id: journalIdentifier, context_wallet_assignment_revision: integer,
  context_lifecycle_revision: integer, expected_terms_kind: choice(["prospective", "committed"]),
  expected_terms_hash: journalHash,
} satisfies Fields<SongContributionRequest>;
const claimFields = {
  idempotency_key: key, client_instance_id: key, submission_attempt_id: key,
  purpose: choice(["funding_transfer", "nonce_cancellation"]),
  expected_state_revision: integer, instruction_hash: journalHash,
} satisfies Fields<SongContributionClaim>;
const observationFields = {
  idempotency_key: key, instruction_hash: journalHash, transaction_hash: journalTransactionHash,
} satisfies Fields<SongContributionObservation>;
const recoveryFields = {
  idempotency_key: key, expected_state_revision: integer, purpose: literal("reconcile_original"),
} satisfies Fields<SongContributionRecovery>;
const cancellationFields = {
  idempotency_key: key, expected_state_revision: integer, purpose: literal("cancel_original_nonce"),
} satisfies Fields<SongContributionCancellation>;

export type ContributionCommandBody =
  | { readonly operation: "CreateSongMegapotContributionV2"; readonly body: SongContributionRequest }
  | { readonly operation: "ClaimSongMegapotContributionSubmissionV2"; readonly body: SongContributionClaim }
  | { readonly operation: "ObserveSongMegapotContributionV2"; readonly body: SongContributionObservation }
  | { readonly operation: "RecoverSongMegapotContributionV2"; readonly body: SongContributionRecovery }
  | { readonly operation: "PrepareSongMegapotContributionCancellationV2"; readonly body: SongContributionCancellation };

/** Browser storage is an untrusted I/O boundary, independent of server decoding. */
export function decodeContributionCommand(operation: SongContributionCommand, raw: string): ContributionCommandBody {
  const value = parseJournalJson(raw);
  switch (operation) {
    case "CreateSongMegapotContributionV2": return { operation, body: fields<SongContributionRequest>(value, createFields) };
    case "ClaimSongMegapotContributionSubmissionV2": return { operation, body: fields<SongContributionClaim>(value, claimFields) };
    case "ObserveSongMegapotContributionV2": return { operation, body: fields<SongContributionObservation>(value, observationFields) };
    case "RecoverSongMegapotContributionV2": return { operation, body: fields<SongContributionRecovery>(value, recoveryFields) };
    case "PrepareSongMegapotContributionCancellationV2": return { operation, body: fields<SongContributionCancellation>(value, cancellationFields) };
  }
}

export function encodeContributionCommand(command: ContributionCommandBody): string {
  const raw = JSON.stringify(command.body);
  decodeContributionCommand(command.operation, raw);
  return raw;
}
