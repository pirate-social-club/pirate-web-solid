import { afterEach, describe, expect, it, vi } from "vitest";
import type { RewardCredit } from "../../api/reward-claim.ts";
import type { GasTopup, GasTopupRequest } from "../../api/reward-winnings-send.ts";
import { RewardFundingNotBroadcastError, type RewardTokenTransfer } from "../../api/reward-wallet-session.ts";
import {
  canSendWinning, checkAmount, checkRecipient, createWinningsSendController, defaultAmount,
  explorerTransactionUrl, waitForGasTopup, type SendState,
} from "./winnings-send-model.ts";

afterEach(() => { vi.useRealTimers(); });

const sender = "0x1111111111111111111111111111111111111111";
const hash = `0x${"ab".repeat(32)}`;
const fee = { gasLimit: "60000", gasPriceAtomic: "2", executionFeeAtomic: "120000" };
const transfer: RewardTokenTransfer = {
  sender, token: "0x3333333333333333333333333333333333333333",
  recipient: "0x4444444444444444444444444444444444444444", amountAtomic: "2000000", walletIndex: 2,
};
const paid: RewardCredit = {
  object: "reward_credit", credit_id: "credit_1", payout_persona_id: "persona_1", chain_id: 84532,
  token_address: "0x3333333333333333333333333333333333333333", token_decimals: 6,
  amount_atomic: "12500000", available_atomic: "0", reserved_atomic: "0", paid_atomic: "12500000",
  source_kind: "megapot_allocation", state: "sent", created_at: "2026-09-25T00:00:00.000Z",
  updated_at: "2026-09-25T00:00:00.000Z", settled_at: "2026-09-25T00:00:00.000Z",
  claim: { status: "accepted", payout_status: "confirmed" },
};
const topup = (status: GasTopup["status"]): GasTopup => ({ status, amount_wei: "1000", transaction_hash: null });

describe("send eligibility and input", () => {
  it("offers send only for a claimed, confirmed payout on Base Sepolia", () => {
    expect(canSendWinning(paid)).toBe(true);
    expect(canSendWinning({ ...paid, claim: { status: "accepted", payout_status: "submitted" } })).toBe(false);
    expect(canSendWinning({ ...paid, claim: { status: "unclaimed", payout_status: null } })).toBe(false);
    expect(canSendWinning({ ...paid, claim: null })).toBe(false);
    expect(canSendWinning({ ...paid, chain_id: 8453 })).toBe(false);
  });
  it("accepts any-case addresses and refuses bad ones and the sender", () => {
    expect(checkRecipient("0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD", sender))
      .toEqual({ ok: true, address: "0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD" });
    expect(checkRecipient("  0xabcdefabcdefabcdefabcdefabcdefabcdefabcd ", sender).ok).toBe(true);
    expect(checkRecipient("0xabc", sender).ok).toBe(false);
    expect(checkRecipient("", sender).ok).toBe(false);
    expect(checkRecipient("0x0000000000000000000000000000000000000000", sender).ok).toBe(false);
    expect(checkRecipient(sender.toUpperCase().replace("0X", "0x"), sender))
      .toEqual({ ok: false, message: "This is the wallet you are sending from. Enter a different address." });
  });
  it("never allows more than the balance", () => {
    expect(checkAmount("2.5", 6, 3_000_000n)).toEqual({ ok: true, atomic: 2_500_000n });
    expect(checkAmount("3.000001", 6, 3_000_000n)).toEqual({ ok: false, message: "You can send up to 3 USDC." });
    expect(checkAmount("0", 6, 3_000_000n).ok).toBe(false);
    expect(checkAmount("1.1234567", 6, undefined).ok).toBe(false);
    expect(checkAmount("abc", 6, undefined).ok).toBe(false);
  });
  it("defaults to the credit amount, lowered to the balance", () => {
    expect(defaultAmount(paid, undefined)).toBe("12.5");
    expect(defaultAmount(paid, 20_000_000n)).toBe("12.5");
    expect(defaultAmount(paid, 4_000_000n)).toBe("4");
  });
  it("links the transaction on the Base Sepolia explorer", () => {
    expect(explorerTransactionUrl(hash)).toBe(`https://sepolia.basescan.org/tx/${hash}`);
  });
});

describe("gas top-up polling", () => {
  it("waits on real timers until the top-up confirms", async () => {
    vi.useFakeTimers();
    const read = vi.fn<(id: string) => Promise<GasTopup>>()
      .mockResolvedValueOnce(topup("requested"))
      .mockRejectedValueOnce(new Error("blip"))
      .mockResolvedValueOnce(topup("broadcast"))
      .mockResolvedValue(topup("confirmed"));
    const outcome = waitForGasTopup(read, "gas-topup_1", { intervalMs: 1000, timeoutMs: 10_000 });
    await vi.advanceTimersByTimeAsync(3000);
    await expect(outcome).resolves.toBe("confirmed");
    expect(read).toHaveBeenCalledTimes(4);
    expect(read).toHaveBeenCalledWith("gas-topup_1");
  });
  it("stops when the top-up is released", async () => {
    vi.useFakeTimers();
    const read = vi.fn(async () => topup("released"));
    await expect(waitForGasTopup(read, "t", { intervalMs: 1000, timeoutMs: 5000 })).resolves.toBe("released");
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("gives up after the bound", async () => {
    vi.useFakeTimers();
    const read = vi.fn(async () => topup("requested"));
    const outcome = waitForGasTopup(read, "t", { intervalMs: 1000, timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(outcome).resolves.toBe("timeout");
    expect(read).toHaveBeenCalledTimes(5);
  });
});

function harness(overrides: Partial<Parameters<typeof createWinningsSendController>[0]> = {}) {
  const states: SendState[] = [];
  const wallet = {
    estimateTransfer: vi.fn(async () => fee),
    sendTransfer: vi.fn(async (_t: RewardTokenTransfer, _f: typeof fee, before: () => Promise<void>) => { await before(); return hash; }),
  };
  const requestGasTopup = vi.fn(async (_creditId: string, _key: string): Promise<GasTopupRequest> => ({ status: "not_needed", topup_id: null, amount_wei: null }));
  const readGasTopup = vi.fn(async () => topup("confirmed"));
  let keys = 0;
  const controller = createWinningsSendController({
    creditId: "credit_1", transfer, wallet, requestGasTopup, readGasTopup,
    onState: state => states.push(state), newKey: () => `key-${++keys}`,
    poll: { intervalMs: 10, timeoutMs: 30, sleep: async () => undefined }, ...overrides,
  });
  return { controller, wallet, requestGasTopup, readGasTopup, states };
}

describe("send controller", () => {
  it("waits for gas, reviews the fee and sends once", async () => {
    const h = harness();
    h.requestGasTopup.mockResolvedValueOnce({ status: "pending", topup_id: "gas-topup_1", amount_wei: "1000" });
    expect(await h.controller.prepare()).toEqual({ kind: "review", fee, gasLimitReached: false, feeChanged: false });
    expect(h.requestGasTopup).toHaveBeenCalledWith("credit_1", "key-1");
    expect(h.readGasTopup).toHaveBeenCalledWith("gas-topup_1");
    expect(await h.controller.confirm()).toEqual({ kind: "sent", transactionHash: hash });
    expect(h.wallet.sendTransfer).toHaveBeenCalledWith(transfer, fee, expect.any(Function));
    expect(h.states.map(state => state.kind)).toEqual(["gas", "review", "sending", "sent"]);
    await h.controller.confirm();
    await h.controller.prepare();
    expect(h.wallet.sendTransfer).toHaveBeenCalledTimes(1);
  });
  it("uses a fresh idempotency key for every attempt", async () => {
    const h = harness();
    await h.controller.prepare();
    await h.controller.prepare();
    expect(h.requestGasTopup.mock.calls.map(call => call[1])).toEqual(["key-1", "key-2"]);
  });
  it("lets the wallet's own ETH pay when gas help is used up", async () => {
    const h = harness();
    h.requestGasTopup.mockResolvedValueOnce({ status: "limit_reached", topup_id: null, amount_wei: null });
    expect(await h.controller.prepare()).toMatchObject({ kind: "review", gasLimitReached: true });
    expect(h.readGasTopup).not.toHaveBeenCalled();
  });
  it("explains when gas help is used up and the wallet has no ETH", async () => {
    const h = harness();
    h.requestGasTopup.mockResolvedValueOnce({ status: "limit_reached", topup_id: null, amount_wei: null });
    h.wallet.estimateTransfer.mockRejectedValueOnce(new Error("wallet_insufficient_gas_balance"));
    expect(await h.controller.prepare()).toEqual({ kind: "failed", reason: "gas_limit_no_eth" });
  });
  it("reports released gas and a timeout that can be checked again", async () => {
    const released = harness();
    released.requestGasTopup.mockResolvedValueOnce({ status: "pending", topup_id: "t1", amount_wei: "1" });
    released.readGasTopup.mockResolvedValue(topup("released"));
    expect(await released.controller.prepare()).toEqual({ kind: "failed", reason: "gas_failed", topupId: "t1" });

    const slow = harness();
    slow.requestGasTopup.mockResolvedValueOnce({ status: "pending", topup_id: "t2", amount_wei: "1" });
    slow.readGasTopup.mockResolvedValue(topup("broadcast"));
    expect(await slow.controller.prepare()).toEqual({ kind: "failed", reason: "gas_timeout", topupId: "t2" });
    slow.readGasTopup.mockResolvedValue(topup("confirmed"));
    expect(await slow.controller.checkGasAgain()).toMatchObject({ kind: "review" });
    expect(slow.requestGasTopup).toHaveBeenCalledTimes(1);
  });
  it("stays quiet about internals when rewards are unavailable", async () => {
    const h = harness();
    h.requestGasTopup.mockRejectedValueOnce(Object.assign(new Error("Provider unavailable"), { code: "provider_unavailable" }));
    expect(await h.controller.prepare()).toEqual({ kind: "failed", reason: "unavailable" });
    expect(h.wallet.estimateTransfer).not.toHaveBeenCalled();
  });
  it("re-estimates when the fee rises before broadcast", async () => {
    const h = harness();
    await h.controller.prepare();
    h.wallet.sendTransfer.mockRejectedValueOnce(new Error("wallet_fee_changed"));
    expect(await h.controller.confirm()).toEqual({ kind: "review", fee, gasLimitReached: false, feeChanged: true });
  });
  it("treats a refusal as nothing sent and allows another try", async () => {
    const h = harness();
    await h.controller.prepare();
    h.wallet.sendTransfer.mockImplementationOnce(async (_t, _f, before) => { await before(); throw Object.assign(new Error("declined"), { code: 4001 }); });
    expect(await h.controller.confirm()).toEqual({ kind: "failed", reason: "refused" });
    expect(await h.controller.prepare()).toMatchObject({ kind: "review" });
  });
  it("treats a local pre-broadcast failure as nothing sent", async () => {
    const h = harness();
    await h.controller.prepare();
    h.wallet.sendTransfer.mockImplementationOnce(async (_t, _f, before) => {
      await before(); throw new RewardFundingNotBroadcastError(new Error("wallet_reauthentication_required"));
    });
    expect(await h.controller.confirm()).toEqual({ kind: "failed", reason: "signed_out" });
  });
  it("never offers another send after an uncertain broadcast", async () => {
    const h = harness();
    await h.controller.prepare();
    h.wallet.sendTransfer.mockImplementationOnce(async (_t, _f, before) => { await before(); throw new Error("wallet_submission_uncertain"); });
    expect(await h.controller.confirm()).toEqual({ kind: "uncertain" });
    expect(await h.controller.prepare()).toEqual({ kind: "uncertain" });
    expect(await h.controller.confirm()).toEqual({ kind: "uncertain" });
    expect(h.wallet.sendTransfer).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["wallet_assignment_mismatch", "wrong_wallet"],
    ["wallet_wrong_chain", "wrong_network"],
    ["wallet_insufficient_token_balance", "insufficient_usdc"],
    ["wallet_insufficient_gas_balance", "no_eth"],
  ])("maps %s from the estimate to %s", async (message, reason) => {
    const h = harness();
    h.wallet.estimateTransfer.mockRejectedValueOnce(new Error(message));
    expect(await h.controller.prepare()).toEqual({ kind: "failed", reason });
  });
});
