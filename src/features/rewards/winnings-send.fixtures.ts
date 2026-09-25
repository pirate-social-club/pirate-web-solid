import type { RewardCredit } from "../../api/reward-claim.ts";
import type { GasTopupRequest } from "../../api/reward-winnings-send.ts";
import type { WinningsSendDependencies, WinningsSendWallet } from "./winnings-send-sheet.tsx";

/** Story data for sending paid winnings. The fixture code is 123456. */
export const paidWinning: RewardCredit = {
  object: "reward_credit", credit_id: "sent", payout_persona_id: "persona_harbor", chain_id: 84532,
  token_address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", token_decimals: 6,
  amount_atomic: "12500000", available_atomic: "0", reserved_atomic: "0", paid_atomic: "12500000",
  source_kind: "megapot_allocation", state: "sent", created_at: "2026-09-25T00:00:00.000Z",
  updated_at: "2026-09-25T00:00:00.000Z", settled_at: "2026-09-25T00:00:00.000Z",
  claim: { status: "accepted", payout_status: "confirmed" },
};

export const fixtureSender = "0x7a3c1f6e2b9d4a5c8e0f1b2c3d4e5f6a7b8c9d0e";
export const fixtureRecipient = "0x9b8a7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b";
export const fixtureHash = `0x${"5e".repeat(32)}`;

export type SendFixtureOptions = Readonly<{
  gas?: GasTopupRequest;
  /** The wallet has no ETH of its own for the fee. */
  noEth?: boolean;
  uncertain?: boolean;
}>;

export function sendFixture(options: SendFixtureOptions = {}): WinningsSendDependencies {
  let authorized = false;
  const wallet: WinningsSendWallet = {
    async sendCode() {},
    async loginWithCode(_email, code) {
      if (code !== "123456") throw new Error("Use fixture code 123456.");
      authorized = true;
    },
    async selectTestnetFor() {},
    async estimateTransfer() {
      if (!authorized) throw new Error("wallet_reauthentication_required");
      if (options.noEth) throw new Error("wallet_insufficient_gas_balance");
      return { gasLimit: "62000", gasPriceAtomic: "1000000000", executionFeeAtomic: "62000000000000" };
    },
    async sendTransfer(_transfer, _fee, beforeBroadcast) {
      await beforeBroadcast();
      if (options.uncertain) throw new Error("wallet_submission_uncertain");
      return fixtureHash;
    },
    dispose() { authorized = false; },
  };
  let reads = 0;
  return {
    data: {
      async sender() { return { address: fixtureSender, walletIndex: 0 }; },
      async tokenBalance() { return 12_500_000n; },
      async requestGasTopup() { return options.gas ?? { status: "pending", topup_id: "gas-topup_story", amount_wei: "30000000000000" }; },
      async readGasTopup() {
        reads += 1;
        return { status: reads > 1 ? "confirmed" : "broadcast", amount_wei: "30000000000000", transaction_hash: null };
      },
    },
    openWallet: async () => wallet,
    poll: { intervalMs: 200, timeoutMs: 10_000 },
  };
}
