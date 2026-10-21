import { expect, test } from "vitest";
import { rememberWalletSend, readWalletSend, forgetWalletSend, type WalletSendDraft } from "./wallet-send-continuation.ts";

const draft: WalletSendDraft = { accountId: "account:1", personaId: "persona_1", walletAddress: `0x${"1".repeat(40)}`,
  recipient: `0x${"2".repeat(40)}`, amount: "1.25", idempotencyKey: "d1f83188-6f51-4d9e-9d3c-8f698d9ed961", sendId: "send_1" };
function store() {
  const entries = new Map<string, string>();
  return { entries, getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } };
}

test("a verification return keeps only the original form and reservation identity", () => {
  const storage = store(); const href = rememberWalletSend(draft, storage, 1000);
  const url = new URL(href, "https://app.test");
  expect(url.searchParams.get("purpose")).toBe("wallet_send");
  expect(url.searchParams.get("persona_id")).toBe(draft.personaId);
  expect(readWalletSend(draft.idempotencyKey, draft.accountId, storage, 2000)).toEqual(draft);
  expect([...storage.entries.values()][0]).not.toMatch(/signature|payload_base64|session_token|proof_session/u);
  forgetWalletSend(draft.idempotencyKey, storage); expect(storage.entries.size).toBe(0);
});

test("an account change drops the hint instead of resuming another account", () => {
  const storage = store(); rememberWalletSend(draft, storage, 1000);
  expect(readWalletSend(draft.idempotencyKey, "account:2", storage, 2000)).toBeUndefined();
  expect(storage.entries.size).toBe(0);
});

test.each([1000 + 60 * 60_000, 999])("expired and future-dated hints cannot resume (%s)", now => {
  const storage = store(); rememberWalletSend(draft, storage, 1000);
  expect(readWalletSend(draft.idempotencyKey, draft.accountId, storage, now)).toBeUndefined();
  expect(storage.entries.size).toBe(0);
});

test("malformed and mismatched hints never become a fresh instruction", () => {
  const storage = store(); rememberWalletSend(draft, storage, 1000);
  const key = [...storage.entries.keys()][0];
  for (const raw of ["{", JSON.stringify({ draft: { ...draft, idempotencyKey: crypto.randomUUID() }, at: 1000 }), JSON.stringify({ draft: { ...draft, amount: "Infinity" }, at: 1000 }), JSON.stringify({ draft: { ...draft, authorization_signature: "must_not_be_retained" }, at: 1000 })]) {
    storage.setItem(key, raw);
    expect(readWalletSend(draft.idempotencyKey, draft.accountId, storage, 2000)).toBeUndefined();
  }
});
