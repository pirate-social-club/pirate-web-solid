import { expect, test } from "vitest";
import { decodeContributionCommand, encodeContributionCommand, type ContributionCommandBody } from "./contribution-command-codec.ts";
import { contributionFixtures as f } from "./song-contributions.fixture.ts";
import { contributionJournalKey, createSongContributionJournal, decodeContributionJournal, type ContributionJournalStore } from "./song-contribution-journal.ts";
import type { SongContributionScope } from "./song-contributions.ts";

const create = { operation: "CreateSongMegapotContributionV2", body: f.createRequest } as const;
const claim = { operation: "ClaimSongMegapotContributionSubmissionV2", body: f.claimRequest } as const;
function fixture() {
  const values = new Map<string, string>(), tails = new Map<string, Promise<void>>();
  let failWrite = false, current: SongContributionScope | null = f.scope;
  const store: ContributionJournalStore = {
    read: key => values.get(key) ?? null,
    write: (key, raw) => { if (failWrite) throw new Error("storage failed"); values.set(key, raw); },
    remove: key => { values.delete(key); },
    async exclusive<T>(key: string, operation: () => Promise<T>) {
      const prior = tails.get(key) ?? Promise.resolve(); let release = () => {};
      const next = new Promise<void>(done => { release = done; }); tails.set(key, prior.then(() => next));
      await prior; try { return await operation(); } finally { release(); }
    },
  };
  const journal = () => createSongContributionJournal({ scope: f.scope, currentScope: () => current, store, nowMs: () => Date.parse(f.claim.receipt.claimed_at) });
  return { values, store, journal, fail: (value: boolean) => { failWrite = value; }, scope: (value: SongContributionScope | null) => { current = value; } };
}
async function initialized(h: ReturnType<typeof fixture>) {
  const journal = h.journal();
  await journal.exclusive(async handle => {
    handle.initialize(create, f.claimRequest.client_instance_id);
    handle.acknowledge(f.createRequest.idempotency_key, f.receipt.request_hash, f.receipt);
  });
  return journal;
}
async function readyToInvoke(h: ReturnType<typeof fixture>) {
  const journal = await initialized(h);
  await journal.exclusive(async handle => {
    handle.append(claim, f.receipt.contribution_id);
    handle.acknowledge(f.claimRequest.idempotency_key, f.claim.receipt.request_hash);
  });
  return journal;
}

test("all five persisted command kinds round-trip their original exact bodies", () => {
  const commands: readonly ContributionCommandBody[] = [create, claim,
    { operation: "ObserveSongMegapotContributionV2", body: f.observationRequest },
    { operation: "RecoverSongMegapotContributionV2", body: f.recoveryRequest },
    { operation: "PrepareSongMegapotContributionCancellationV2", body: f.cancellationRequest },
  ];
  for (const command of commands) expect(decodeContributionCommand(command.operation, encodeContributionCommand(command))).toEqual(command);
});

test.each([
  { ...f.createRequest, activity: "study" },
  { ...f.createRequest, context_ref: {} },
  { ...f.createRequest, expected_terms_kind: "either" },
  { ...f.createRequest, expected_context_hash: "wrong" },
  { ...f.createRequest, funding_amount_atomic: "1.5" },
  { ...f.createRequest, funding_amount_atomic: (2n ** 256n).toString() },
  { ...f.createRequest, expected_lifecycle_revision: Number.MAX_SAFE_INTEGER + 1 },
  { ...f.createRequest, context_wallet_assignment_id: undefined },
])("invalid or augmented stored money commands fail closed", body => {
  expect(() => decodeContributionCommand(create.operation, JSON.stringify(body))).toThrow("journal_corrupt");
});

test("reopening retains the original request and cannot initialize another contribution", async () => {
  const h = fixture(), journal = h.journal(), key = contributionJournalKey(f.scope);
  await journal.exclusive(async handle => { handle.initialize(create, f.claimRequest.client_instance_id); });
  const saved = h.values.get(key);
  expect(h.journal().read()?.commands[0]?.bodyJson).toBe(JSON.stringify(f.createRequest));
  await expect(h.journal().exclusive(async handle => { handle.initialize({ ...create, body: { ...f.createRequest, idempotency_key: "different_original_key_01" } }, f.claimRequest.client_instance_id); })).rejects.toThrow("journal_pending");
  expect(h.values.get(key)).toBe(saved);
});

test("two journal instances serialize the actor/song even before a server identity exists", async () => {
  const h = fixture(), order: string[] = []; let release = () => {};
  const held = new Promise<void>(done => { release = done; });
  const first = h.journal().exclusive(async handle => { handle.initialize(create, f.claimRequest.client_instance_id); order.push("first"); await held; });
  const second = h.journal().exclusive(async handle => { order.push("second"); expect(handle.read()?.commands[0]?.bodyJson).toBe(JSON.stringify(f.createRequest)); });
  await Promise.resolve(); expect(order).toEqual(["first"]);
  release(); await Promise.all([first, second]); expect(order).toEqual(["first", "second"]);
});

test("the invocation marker is durable before a wallet can be called and survives a lost result", async () => {
  const h = fixture(), journal = await readyToInvoke(h); let calls = 0;
  await journal.exclusive(async handle => {
    handle.beforeWallet(f.claimRequest.idempotency_key, f.claim);
    expect(h.journal().read()?.invocations).toHaveLength(1);
    calls++; // stand-in for the wallet RPC; no token, provider or chain call.
  });
  expect(calls).toBe(1);
  expect(h.journal().read()?.invocations[0]?.transactionHash).toBeNull();
  await expect(h.journal().exclusive(async handle => { handle.beforeWallet(f.claimRequest.idempotency_key, f.claim); calls++; })).rejects.toThrow("invocation_forbidden");
  expect(calls).toBe(1);
});

test("a failed pre-wallet storage write permits no wallet invocation", async () => {
  const h = fixture(), journal = await readyToInvoke(h); let calls = 0;
  h.fail(true);
  await expect(journal.exclusive(async handle => { handle.beforeWallet(f.claimRequest.idempotency_key, f.claim); calls++; })).rejects.toThrow("storage failed");
  expect(calls).toBe(0); expect(h.journal().read()?.invocations).toEqual([]);
});

test("recovery-only delivery, a different command receipt or an unacknowledged claim cannot sign", async () => {
  const h = fixture(), journal = await readyToInvoke(h);
  for (const delivery of [f.claimReplay, { ...f.claim, receipt: { ...f.claim.receipt, request_hash: "f".repeat(64) } }, { ...f.claim, receipt: { ...f.claim.receipt, submission_attempt_id: "different_submission_attempt" } }])
    await expect(journal.exclusive(async handle => { handle.beforeWallet(f.claimRequest.idempotency_key, delivery); })).rejects.toThrow();
  expect(journal.read()?.invocations).toEqual([]);
  const unacknowledged = fixture(), pending = await initialized(unacknowledged);
  await pending.exclusive(async handle => { handle.append(claim, f.receipt.contribution_id); });
  await expect(pending.exclusive(async handle => { handle.beforeWallet(f.claimRequest.idempotency_key, f.claim); })).rejects.toThrow("claim_mismatch");
});

test("a transaction locator is monotonic and conflicts preserve the first hash", async () => {
  const h = fixture(), journal = await readyToInvoke(h);
  await journal.exclusive(async handle => {
    handle.beforeWallet(f.claimRequest.idempotency_key, f.claim);
    handle.recordTransaction(f.claimRequest.idempotency_key, f.observationRequest.transaction_hash);
  });
  await expect(journal.exclusive(async handle => { handle.recordTransaction(f.claimRequest.idempotency_key, `0x${"ff".repeat(32)}`); })).rejects.toThrow("transaction_mismatch");
  expect(journal.read()?.invocations[0]?.transactionHash).toBe(f.observationRequest.transaction_hash);
});

test("session changes and escaped handles clear authority without deleting the original journal", async () => {
  const h = fixture(), journal = await initialized(h), before = h.values.get(contributionJournalKey(f.scope));
  let escaped: (() => void) | undefined;
  await journal.exclusive(async handle => { escaped = () => { handle.append(claim, f.receipt.contribution_id); }; });
  expect(() => escaped!()).toThrow("lease_closed");
  h.scope(null); expect(() => journal.read()).toThrow("scope_changed");
  expect(h.values.get(contributionJournalKey(f.scope))).toBe(before);
  h.scope(f.scope); expect(journal.read()?.contributionId).toBe(f.receipt.contribution_id);
});

test("corrupt or foreign journals remain preserved and cannot be replaced", async () => {
  const h = fixture(), journal = await initialized(h), key = contributionJournalKey(f.scope), valid = h.values.get(key)!;
  const foreign = JSON.stringify({ ...journal.read(), accountId: "other-account" });
  for (const raw of ["not JSON", foreign, JSON.stringify({ ...journal.read(), version: 99 }), JSON.stringify({ ...journal.read(), unexpected: true })]) {
    h.values.set(key, raw);
    expect(() => journal.read()).toThrow("journal_corrupt");
    await expect(journal.exclusive(async handle => { handle.initialize(create, f.claimRequest.client_instance_id); })).rejects.toThrow("journal_corrupt");
    expect(h.values.get(key)).toBe(raw);
  }
  h.values.set(key, valid); expect(decodeContributionJournal(valid, f.scope).commands).toHaveLength(1);
});

test("expiry alone cannot archive; proven closure preserves history before removing the active pointer", async () => {
  const h = fixture(), journal = await initialized(h), key = contributionJournalKey(f.scope);
  await expect(journal.exclusive(async handle => { handle.archive({ ...f.current, state: "expired_reconciling", allowed_actions: ["start_fresh_contribution"] }); })).rejects.toThrow("resolution_unproven");
  expect(journal.read()).not.toBeNull();
  const closed = { ...f.current, state: "nonce_closed_no_principal", nonce_state: "consumed_cancellation", allowed_actions: ["start_fresh_contribution"] } as const;
  await journal.exclusive(async handle => { handle.archive(closed); });
  expect(journal.read()).toBeNull();
  expect(JSON.parse(h.values.get(`${key}:history:${f.createRequest.idempotency_key}`)!)).toMatchObject({ entry: { commands: [{ operation: create.operation, bodyJson: JSON.stringify(f.createRequest) }] } });
});

test("failed history persistence cannot clear the original active record", async () => {
  const h = fixture(), journal = await initialized(h), key = contributionJournalKey(f.scope), raw = h.values.get(key);
  h.fail(true);
  await expect(journal.exclusive(async handle => { handle.archive({ ...f.current, state: "nonce_closed_no_principal", nonce_state: "consumed_cancellation", allowed_actions: ["start_fresh_contribution"] }); })).rejects.toThrow("storage failed");
  expect(h.values.get(key)).toBe(raw);
});

test("a grant expiring after delivery still cannot start a wallet invocation", async () => {
  const h = fixture(); await readyToInvoke(h);
  const expired = createSongContributionJournal({ scope: f.scope, currentScope: () => f.scope, store: h.store, nowMs: () => Date.parse(f.claim.receipt.valid_until) });
  await expect(expired.exclusive(async handle => { handle.beforeWallet(f.claimRequest.idempotency_key, f.claim); })).rejects.toThrow("claim_mismatch");
  expect(expired.read()?.invocations).toEqual([]);
});

test("a different claim key cannot invoke the same funding instruction a second time", async () => {
  const h = fixture(), journal = await readyToInvoke(h);
  await journal.exclusive(async handle => { handle.beforeWallet(f.claimRequest.idempotency_key, f.claim); });
  const body = { ...f.claimRequest, idempotency_key: "another_claim_submission_key_01" };
  await journal.exclusive(async handle => {
    handle.append({ operation: claim.operation, body }, f.receipt.contribution_id);
    handle.acknowledge(body.idempotency_key, "f".repeat(64));
  });
  await expect(journal.exclusive(async handle => { handle.beforeWallet(body.idempotency_key, { ...f.claim, receipt: { ...f.claim.receipt, request_hash: "f".repeat(64), grant_id: "another-grant" } }); })).rejects.toThrow("invocation_forbidden");
  expect(journal.read()?.invocations).toHaveLength(1);
});

test.each([
  { ...f.receipt, accepted_context_hash: "f".repeat(64) },
  { ...f.receipt, instruction: { ...f.receipt.instruction, amount_atomic: "1" } },
])("a recovered receipt cannot replace the original create terms", async receipt => {
  const h = fixture(), journal = h.journal();
  await journal.exclusive(async handle => { handle.initialize(create, f.claimRequest.client_instance_id); });
  await expect(journal.exclusive(async handle => { handle.acknowledge(f.createRequest.idempotency_key, receipt.request_hash, receipt); })).rejects.toThrow("receipt_mismatch");
  expect(journal.read()?.contributionId).toBeNull();
  expect(journal.read()?.commands[0]?.bodyJson).toBe(JSON.stringify(f.createRequest));
});

test.each([
  { funding_effect_id: "another-effect" },
  { command_receipt: { ...f.receipt, contribution_id: "another-contribution" } },
  { target: { ...f.current.target, canonical_song_id: "another-song" } },
])("a contradictory resolution cannot discard the original journal", async change => {
  const h = fixture(), journal = await initialized(h), key = contributionJournalKey(f.scope), original = h.values.get(key);
  await expect(journal.exclusive(async handle => { handle.archive({ ...f.current, state: "nonce_closed_no_principal", nonce_state: "consumed_cancellation", allowed_actions: ["start_fresh_contribution"], ...change }); })).rejects.toThrow("resolution_unproven");
  expect(h.values.get(key)).toBe(original);
});
