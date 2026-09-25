import { describe, expect, it, vi } from "vitest";
import { decodeFunctionData, erc20Abi } from "viem";
import {
  createRewardWalletSession, fundingTransfer, rewardTransfer, tokenTransfer,
  RewardFundingNotBroadcastError, type RewardTokenTransfer,
} from "./reward-wallet-session.ts";
import type { EthereumProvider, PrivyAuthClient } from "./privy-session.ts";
import { context, fee, recipient, sender, token, transactionHash } from "../../test/fixtures/reward-funding.ts";

const payee = "0x4444444444444444444444444444444444444444";
const winnings: RewardTokenTransfer = { sender, token, recipient: payee, amountAtomic: "2500000", walletIndex: 7 };

function harness() {
  const requests: Array<{ method: string; params?: readonly unknown[] }> = [];
  const responses = new Map<string, unknown>([
    ["eth_accounts", [sender]], ["eth_chainId", "0x14a34"], ["eth_call", "0x989680"],
    ["eth_estimateGas", "0xc350"], ["eth_gasPrice", "0x2"], ["eth_getBalance", "0x989680"],
    ["eth_sendTransaction", transactionHash], ["wallet_switchEthereumChain", null],
  ]);
  const provider: EthereumProvider = { request: vi.fn(async request => { requests.push(request); return responses.get(request.method); }) };
  const client: PrivyAuthClient = {
    initialize: vi.fn(async () => undefined), getAccessToken: vi.fn(async () => "private-provider-token"),
    auth: { email: { sendCode: vi.fn(async () => ({ success: true })), loginWithCode: vi.fn(async () => undefined) } },
    getEmbeddedEthereumProvider: vi.fn(async () => provider), dispose: vi.fn(),
  };
  const create = async () => {
    const session = await createRewardWalletSession({ enabled: true, privyAppId: "app" }, async () => client);
    await session.loginWithCode("winner@example.test", "fixture-code");
    return session;
  };
  return { create, client, responses, requests };
}

describe("generalised token transfer", () => {
  it("describes the funding instruction exactly as before", () => {
    expect(fundingTransfer(context())).toEqual({ sender, token, recipient, amountAtomic: "1000000", walletIndex: 3 });
    expect(rewardTransfer(context())).toEqual(tokenTransfer(fundingTransfer(context())));
  });
  it("encodes only a USDC transfer to the chosen recipient", () => {
    const tx = tokenTransfer(winnings);
    expect(tx).toMatchObject({ from: sender, to: token, value: "0x0", chainId: "0x14a34" });
    expect(decodeFunctionData({ abi: erc20Abi, data: tx.data })).toMatchObject({ functionName: "transfer", args: [payee, 2500000n] });
  });
  it.each(["0", "-1", "1.5", "", (2n ** 256n).toString()])("refuses the amount %s", amountAtomic => {
    expect(() => tokenTransfer({ ...winnings, amountAtomic })).toThrow("transfer_invalid_amount");
  });
  it("estimates and sends from the payout wallet's embedded provider", async () => {
    const h = harness(); const session = await h.create();
    expect(await session.estimateTransfer(winnings)).toEqual(fee);
    const before = vi.fn(async () => undefined);
    expect(await session.sendTransfer(winnings, fee, before)).toBe(transactionHash);
    expect(before).toHaveBeenCalledOnce();
    expect(h.client.getEmbeddedEthereumProvider).toHaveBeenCalledWith(7, sender);
    const submission = h.requests.find(item => item.method === "eth_sendTransaction");
    expect(submission?.params).toEqual([{ ...tokenTransfer(winnings), gas: "0xea60", gasPrice: "0x2" }]);
  });
  it("refuses a signed-in wallet that is not the payout wallet", async () => {
    const h = harness(); const session = await h.create();
    h.responses.set("eth_accounts", [payee]);
    await expect(session.selectTestnetFor(winnings)).rejects.toThrow("wallet_assignment_mismatch");
    await expect(session.sendTransfer(winnings, fee, async () => undefined)).rejects.toThrow("wallet_assignment_mismatch");
    expect(h.requests.some(item => item.method === "eth_sendTransaction")).toBe(false);
  });
  it("checks the chosen amount against the USDC balance", async () => {
    const h = harness(); const session = await h.create();
    await expect(session.estimateTransfer({ ...winnings, amountAtomic: "10000001" })).rejects.toThrow("wallet_insufficient_token_balance");
  });
  it("reports missing gas before any broadcast", async () => {
    const h = harness(); const session = await h.create();
    h.responses.set("eth_getBalance", "0x0");
    await expect(session.estimateTransfer(winnings)).rejects.toThrow("wallet_insufficient_gas_balance");
  });
  it("keeps the not-broadcast guarantee for an expiry inside the broadcast hook", async () => {
    vi.useFakeTimers();
    try {
      const h = harness(); const session = await h.create();
      await expect(session.sendTransfer(winnings, fee, async () => { vi.advanceTimersByTime(300001); }))
        .rejects.toBeInstanceOf(RewardFundingNotBroadcastError);
      expect(h.requests.some(item => item.method === "eth_sendTransaction")).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});
