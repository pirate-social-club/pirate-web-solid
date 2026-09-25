import { createPublicClient, erc20Abi, getAddress, http } from "viem";
import { baseSepolia } from "viem/chains";
import type { GetRewardsGasTopupsTopupIdResponse, PostRewardsGasTopupsResponse, GetRewardsCreditsCreditIdSendResponse } from "@pirate/api-client";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions, type PirateApiClient } from "./client.ts";
import type { RewardCredit } from "./reward-claim.ts";

export type GasTopupRequest = PostRewardsGasTopupsResponse;
export type GasTopup = GetRewardsGasTopupsTopupIdResponse;
export type WinnerSendRecord = GetRewardsCreditsCreditIdSendResponse;

/** The embedded wallet that received a credit's USDC payout. */
export interface WinningsSender {
  readonly address: string;
  readonly walletIndex: number;
}

export interface WinningsSendData {
  sender(credit: RewardCredit): Promise<WinningsSender>;
  readSend(creditId: string): Promise<WinnerSendRecord | null>;
  requestSend(creditId: string, recipient: string, amountAtomic: string, idempotencyKey: string): Promise<WinnerSendRecord>;
  attachTransfer(sendId: string, hash: string): Promise<WinnerSendRecord>;
  attachCancellation(sendId: string, hash: string): Promise<WinnerSendRecord>;
  requestGasTopup(creditId: string, idempotencyKey: string): Promise<GasTopupRequest>;
  readGasTopup(topupId: string): Promise<GasTopup>;
  /** The sender's USDC balance, read from the public chain without app credentials. */
  tokenBalance(token: string, owner: string): Promise<bigint>;
  /** A known transaction's gas price, used to price a same-nonce replacement. */
  replacementGasPrice(record: WinnerSendRecord): Promise<bigint>;
}

/** Credential-free Base Sepolia reads used by the send sheet. */
export type WinningsChainReads = Pick<WinningsSendData, "tokenBalance" | "replacementGasPrice">;

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
  const write = () => {
    const token = csrf();
    if (token === undefined) throw new Error("winnings_send_csrf_required");
    return sessionRequestOptions(token);
  };
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
    async readSend(creditId) {
      try { return await client.get_rewardsCreditsCreditIdSend({ path: { creditId } }); }
      catch (error) {
        if (error !== null && typeof error === "object" && "status" in error && error.status === 404) return null;
        throw error;
      }
    },
    requestSend(creditId, recipient, amountAtomic, idempotencyKey) {
      return client.post_rewardsCreditsCreditIdSend({
        path: { creditId }, body: { recipient, amount_atomic: amountAtomic, idempotency_key: idempotencyKey },
      }, write());
    },
    attachTransfer(sendId, hash) {
      return client.post_rewardsWinnerSendsSendIdTransactions({ path: { sendId }, body: { transaction_hash: hash } }, write());
    },
    attachCancellation(sendId, hash) {
      return client.post_rewardsWinnerSendsSendIdCancellation({ path: { sendId }, body: { transaction_hash: hash } }, write());
    },
    async requestGasTopup(creditId, idempotencyKey) {
      return client.post_rewardsGasTopups({ body: { credit_id: creditId, idempotency_key: idempotencyKey } }, write());
    },
    readGasTopup(topupId) {
      return client.get_rewardsGasTopupsTopupId({ path: { topupId } });
    },
    tokenBalance: chain.tokenBalance,
    replacementGasPrice: chain.replacementGasPrice,
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
  async replacementGasPrice(record) {
    const hashes = [...record.transaction_hashes, ...record.cancellation_hashes];
    if (hashes.length === 0) throw new Error("replacement_hash_missing");
    const client = await baseSepoliaClient();
    const prices = await Promise.all(hashes.map(async hash => {
      if (!/^0x[0-9a-f]{64}$/iu.test(hash)) throw new Error("replacement_hash_invalid");
      // SAFETY: the preceding pattern check proves this is a 0x-prefixed transaction hash.
      const transaction = await client.getTransaction({ hash: hash as `0x${string}` });
      if (getAddress(transaction.from) !== getAddress(record.sender) || transaction.nonce !== record.nonce) {
        throw new Error("replacement_transaction_mismatch");
      }
      return transaction.gasPrice ?? transaction.maxFeePerGas;
    }));
    if (prices.some(price => price === undefined)) throw new Error("replacement_price_unavailable");
    return prices.reduce<bigint>((highest, price) => price! > highest ? price! : highest, 0n);
  },
};
