import { describe, expect, it, vi } from "vitest";
import { createSessionApiClient } from "./client.ts";
import type { RewardCredit } from "./reward-claim.ts";
import { createWinningsSendData } from "./reward-winnings-send.ts";

const credit: RewardCredit = {
  object: "reward_credit", credit_id: "credit_1", payout_persona_id: "persona_paid", chain_id: 84532,
  token_address: "0x3333333333333333333333333333333333333333", token_decimals: 6,
  amount_atomic: "2000000", available_atomic: "0", reserved_atomic: "0", paid_atomic: "2000000",
  source_kind: "megapot_allocation", state: "sent", created_at: "2026-09-25T00:00:00.000Z",
  updated_at: "2026-09-25T00:00:00.000Z", settled_at: "2026-09-25T00:00:00.000Z",
  claim: { status: "accepted", payout_status: "confirmed" }, send: null,
};
const record = {
  object: "reward_winner_send", send_id: "send_1", credit_id: credit.credit_id, status: "retryable",
  chain_id: 84532, sender: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  recipient: "0x5555555555555555555555555555555555555555", token_address: credit.token_address,
  amount_atomic: "2000000", nonce: 7, attempt: 1, transaction_hashes: [], cancellation_hashes: [],
};

type PersonaRow = Readonly<{ id: string; status: string; address: string | null; index: number }>;

function persona(row: PersonaRow) {
  return {
    persona_id: row.id, object: "persona", status: row.status,
    profile: { persona_id: row.id, object: "persona_profile", revision: 1, display_name: null, avatar_ref: null, cover_ref: null, bio: null, preferred_locale: null, primary_public_handle: null },
    wallet_set: { evm: row.address === null ? null : { chain_account_kind: "evm", address: row.address, hd_wallet_index: row.index, assigned_at: "2026-09-25T00:00:00.000Z" } },
    community_binding: null, created_at: "2026-09-25T00:00:00.000Z", retired_at: null,
  };
}

function harness(rows: readonly PersonaRow[], csrf: () => string | undefined = () => "csrf-fixture", sendMissing = false) {
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const path = url.pathname.slice(4);
    let response;
    if (path === "/personas") response = { personas: rows.map(persona) };
    else if (path === "/rewards/gas-topups" && init?.method === "POST") {
      expect(new Headers(init.headers).get("x-csrf-token")).toBe("csrf-fixture");
      response = { status: "pending", topup_id: "gas-topup_1", amount_wei: "1000" };
    } else if (path === "/rewards/gas-topups/gas-topup_1") response = { status: "confirmed", amount_wei: "1000", transaction_hash: null };
    else if (path === "/rewards/credits/credit_1/send") {
      if (sendMissing && init?.method !== "POST") {
        return new Response(JSON.stringify({ code: "not_found", message: "not found" }), { status: 404, headers: { "content-type": "application/json" } });
      }
      response = record;
    }
    else if (path === "/rewards/winner-sends/send_1/transactions") response = { ...record, status: "pending", transaction_hashes: [`0x${"ab".repeat(32)}`] };
    else if (path === "/rewards/winner-sends/send_1/cancellation") response = { ...record, status: "pending", cancellation_hashes: [`0x${"ab".repeat(32)}`] };
    else throw new Error(`unexpected ${path}`);
    return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
  });
  const data = createWinningsSendData(createSessionApiClient({ origin: "https://app.example", fetchImpl }), csrf, {
    tokenBalance: async () => 0n, replacementGasPrice: async () => 1n,
  });
  return { data, fetchImpl };
}

describe("winnings send data", () => {
  it("resolves the sender from the credit's payout persona, not another persona", async () => {
    const { data } = harness([
      { id: "persona_other", status: "active", address: "0x5555555555555555555555555555555555555555", index: 1 },
      { id: "persona_paid", status: "active", address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd", index: 4 },
    ]);
    expect(await data.sender(credit)).toEqual({ address: "0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD", walletIndex: 4 });
  });
  it.each([
    ["missing", []],
    ["retired", [{ id: "persona_paid", status: "retired", address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd", index: 4 }]],
    ["walletless", [{ id: "persona_paid", status: "active", address: null, index: 0 }]],
  ] as const)("refuses a %s payout persona", async (_name, rows) => {
    const { data } = harness(rows);
    await expect(data.sender(credit)).rejects.toThrow("winnings_sender_unavailable");
  });
  it("requests a gas top-up for the credit with the attempt's key and reads it back", async () => {
    const { data, fetchImpl } = harness([]);
    expect(await data.requestGasTopup("credit_1", "key-1")).toEqual({ status: "pending", topup_id: "gas-topup_1", amount_wei: "1000" });
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({ credit_id: "credit_1", idempotency_key: "key-1" });
    expect(await data.readGasTopup("gas-topup_1")).toEqual({ status: "confirmed", amount_wei: "1000", transaction_hash: null });
  });
  it("does not request gas without a CSRF token", async () => {
    const { data, fetchImpl } = harness([], () => undefined);
    await expect(data.requestGasTopup("credit_1", "key-1")).rejects.toThrow("winnings_send_csrf_required");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("treats only a missing server send as a blank form", async () => {
    const { data } = harness([], () => "csrf-fixture", true);
    expect(await data.readSend("credit_1")).toBeNull();
  });
  it("records a send before signing and attaches the reported hash with CSRF", async () => {
    const { data, fetchImpl } = harness([]);
    const created = await data.requestSend("credit_1", record.recipient, "2000000", "key-1");
    expect(created.nonce).toBe(7);
    expect(await data.readSend("credit_1")).toMatchObject({ send_id: "send_1", nonce: 7 });
    await data.attachTransfer("send_1", `0x${"ab".repeat(32)}`);
    await data.attachCancellation("send_1", `0x${"ab".repeat(32)}`);
    const writes = fetchImpl.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(writes).toHaveLength(3);
    for (const [, init] of writes) expect(new Headers(init?.headers).get("x-csrf-token")).toBe("csrf-fixture");
    expect(JSON.parse(String(writes[0]?.[1]?.body))).toEqual({ recipient: record.recipient, amount_atomic: "2000000", idempotency_key: "key-1" });
  });
});
