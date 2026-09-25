import { describe, expect, it } from "vitest";
import type { RewardCredit } from "../../api/reward-claim.ts";
import type { WinnerSendRecord } from "../../api/reward-winnings-send.ts";
import type { RewardTokenTransfer } from "../../api/reward-wallet-session.ts";
import {
  canBroadcast, canSendWinning, checkAmount, checkRecipient, defaultAmount,
  recordMatches, recordedTransfer, replacementFloor, sendableAtomic, waitForGasTopup,
} from "./winnings-send-model.ts";

const sender = "0x1111111111111111111111111111111111111111";
const recipient = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const token = "0x3333333333333333333333333333333333333333";
const paid: RewardCredit = {
  object: "reward_credit", credit_id: "credit_1", payout_persona_id: "persona_1", chain_id: 84532,
  token_address: token, token_decimals: 6, amount_atomic: "12500000", available_atomic: "0",
  reserved_atomic: "0", paid_atomic: "12500000", source_kind: "megapot_allocation", state: "sent",
  created_at: "2026-09-25T00:00:00.000Z", updated_at: "2026-09-25T00:00:00.000Z",
  settled_at: "2026-09-25T00:00:00.000Z", claim: { status: "accepted", payout_status: "confirmed" }, send: null,
};
const record: WinnerSendRecord = {
  object: "reward_winner_send", send_id: "send_1", credit_id: paid.credit_id, status: "retryable",
  chain_id: 84532, sender, recipient, token_address: token, amount_atomic: "12500000", nonce: 7,
  attempt: 1, transaction_hashes: [], cancellation_hashes: [],
};
const transfer: RewardTokenTransfer = { sender, token, recipient, amountAtomic: "12500000", walletIndex: 2 };

describe("winner send safety", () => {
  it("only offers sends for paid, claimed Base Sepolia winnings", () => {
    expect(canSendWinning(paid)).toBe(true);
    expect(canSendWinning({ ...paid, claim: null })).toBe(false);
    expect(canSendWinning({ ...paid, chain_id: 8453 })).toBe(false);
    expect(canSendWinning({ ...paid, claim: { status: "accepted", payout_status: "submitted" } })).toBe(false);
  });
  it("refuses token, self, zero and bad-checksum recipients", () => {
    expect(checkRecipient(recipient, sender, token).ok).toBe(true);
    expect(checkRecipient(sender, sender, token).ok).toBe(false);
    expect(checkRecipient(token, sender, token).ok).toBe(false);
    expect(checkRecipient("0x0000000000000000000000000000000000000000", sender, token).ok).toBe(false);
    expect(checkRecipient("0xAbcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD", sender, token).ok).toBe(false);
  });
  it("caps the amount at the paid winning and wallet balance", () => {
    expect(sendableAtomic(paid, 4_000_000n)).toBe(4_000_000n);
    expect(defaultAmount(paid, 4_000_000n)).toBe("4");
    expect(checkAmount("12.500001", 6, sendableAtomic(paid, 20_000_000n)).ok).toBe(false);
    expect(checkAmount("12.5", 6, sendableAtomic(paid, 20_000_000n))).toEqual({ ok: true, atomic: 12_500_000n });
  });
  it("uses the server's exact sender, transfer and nonce", () => {
    expect(recordMatches(record, transfer, paid.credit_id)).toBe(true);
    expect(recordMatches({ ...record, amount_atomic: "12500001" }, transfer, paid.credit_id)).toBe(false);
    expect(recordedTransfer(record, 2, false)).toMatchObject({ ...transfer, nonce: 7, allowReplacement: false });
    expect(recordedTransfer(record, 2, true).allowReplacement).toBe(true);
  });
  it("only broadcasts for the matching server status", () => {
    expect(canBroadcast("retryable", "retry")).toBe(true);
    expect(canBroadcast("pending", "retry")).toBe(false);
    expect(canBroadcast("pending", "replace")).toBe(true);
    expect(canBroadcast("retryable", "replace")).toBe(false);
    expect(canBroadcast("confirmed", "cancel")).toBe(false);
    expect(canBroadcast("settled_unverified", "retry")).toBe(false);
  });
  it("bumps a replacement at least one quarter above its prior gas price", () => {
    expect(replacementFloor(100n)).toBe(125n);
    expect(replacementFloor(1n)).toBe(2n);
  });
  it("waits for confirmed gas and stops on a released top-up", async () => {
    expect(await waitForGasTopup(async () => ({ status: "confirmed", amount_wei: "1", transaction_hash: null }), "t")).toBe("confirmed");
    expect(await waitForGasTopup(async () => ({ status: "released", amount_wei: "1", transaction_hash: null }), "t")).toBe("released");
  });
});
