import { createPublicClient, erc20Abi, getAddress, http } from "viem";
import { baseSepolia } from "viem/chains";
import type { GetRewardsGasTopupsTopupIdResponse, PostRewardsGasTopupsResponse } from "@pirate/api-client";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions, type PirateApiClient } from "./client.ts";
import type { RewardCredit } from "./reward-claim.ts";

export type GasTopupRequest = PostRewardsGasTopupsResponse;
export type GasTopup = GetRewardsGasTopupsTopupIdResponse;

/** The embedded wallet that received a credit's USDC payout. */
export interface WinningsSender {
  readonly address: string;
  readonly walletIndex: number;
}

export interface WinningsSendData {
  sender(credit: RewardCredit): Promise<WinningsSender>;
  requestGasTopup(creditId: string, idempotencyKey: string): Promise<GasTopupRequest>;
  readGasTopup(topupId: string): Promise<GasTopup>;
  /** The sender's USDC balance, read from the public chain without app credentials. */
  tokenBalance(token: string, owner: string): Promise<bigint>;
  /** Whether a mined transaction succeeded, reverted, or is not mined yet. */
  transferReceipt(hash: string): Promise<TransferReceipt>;
  /** True while the wallet has a transaction waiting in the mempool (pending nonce above latest). */
  walletBusy(address: string): Promise<boolean>;
}

export type TransferReceipt = "confirmed" | "reverted" | "pending";

/** Credential-free Base Sepolia reads used by the send sheet. */
export type WinningsChainReads = Pick<WinningsSendData, "tokenBalance" | "transferReceipt" | "walletBusy">;

/**
 * Spec 015 §5.2a. A paid winner sends their USDC on from the payout wallet,
 * with native gas from a platform top-up. The sender is resolved the same way
 * the funding flow resolves a persona wallet: the credit's payout persona and
 * its active EVM assignment from the account-private persona list.
 */
export function createWinningsSendData(
  client: PirateApiClient = createSessionApiClient(),
  csrf: () => string | undefined = readCsrfCookie,
  chain: WinningsChainReads = baseSepoliaReads,
): WinningsSendData {
  return {
    async sender(credit) {
      // The server funds gas to the credit's confirmed payout destination, which
      // the API does not expose. This resolves the payout persona's current
      // wallet instead. They cannot differ today, because an active public
      // persona must keep its wallet; the session still refuses any other
      // signed-in account.
      const { personas } = await client.get_personas(undefined);
      const persona = personas.find(item => item.persona_id === credit.payout_persona_id);
      const wallet = persona?.wallet_set.evm;
      if (persona?.status !== "active" || wallet == null) throw new Error("winnings_sender_unavailable");
      return { address: getAddress(wallet.address), walletIndex: wallet.hd_wallet_index };
    },
    async requestGasTopup(creditId, idempotencyKey) {
      const token = csrf();
      if (token === undefined) throw new Error("winnings_send_csrf_required");
      return client.post_rewardsGasTopups({ body: { credit_id: creditId, idempotency_key: idempotencyKey } }, sessionRequestOptions(token));
    },
    readGasTopup(topupId) {
      return client.get_rewardsGasTopupsTopupId({ path: { topupId } });
    },
    tokenBalance: chain.tokenBalance,
    transferReceipt: chain.transferReceipt,
    walletBusy: chain.walletBusy,
  };
}

/** Browser-only chain reads; cookies, sessions and persona identifiers never reach the RPC provider. */
async function baseSepoliaClient() {
  const client = createPublicClient({ chain: baseSepolia, transport: http(baseSepolia.rpcUrls.default.http[0], {
    retryCount: 0, timeout: 8_000,
    fetchOptions: { credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" },
  }) });
  if (await client.getChainId() !== baseSepolia.id) throw new Error("wallet_network_mismatch");
  return client;
}

export const baseSepoliaReads: WinningsChainReads = {
  async tokenBalance(token, owner) {
    const client = await baseSepoliaClient();
    return client.readContract({ address: getAddress(token), abi: erc20Abi, functionName: "balanceOf", args: [getAddress(owner)] });
  },
  async transferReceipt(hash) {
    if (!/^0x[0-9a-f]{64}$/iu.test(hash)) throw new Error("invalid_transaction_hash");
    const client = await baseSepoliaClient();
    // The raw call answers null for an unmined transaction instead of throwing.
    // SAFETY: the pattern check above proves hash is 0x followed by 64 hex digits.
    const receipt = await client.request({ method: "eth_getTransactionReceipt", params: [hash as `0x${string}`] });
    if (receipt === null) return "pending";
    return receipt.status === "0x1" ? "confirmed" : "reverted";
  },
  async walletBusy(address) {
    const client = await baseSepoliaClient();
    const owner = getAddress(address);
    const [pending, latest] = await Promise.all([
      client.getTransactionCount({ address: owner, blockTag: "pending" }),
      client.getTransactionCount({ address: owner, blockTag: "latest" }),
    ]);
    return pending > latest;
  },
};
