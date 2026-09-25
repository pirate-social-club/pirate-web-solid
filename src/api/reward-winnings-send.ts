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
}

/**
 * Spec 015 §5.2a. A paid winner sends their USDC on from the payout wallet,
 * with native gas from a platform top-up. The sender is resolved the same way
 * the funding flow resolves a persona wallet: the credit's payout persona and
 * its active EVM assignment from the account-private persona list.
 */
export function createWinningsSendData(
  client: PirateApiClient = createSessionApiClient(),
  csrf: () => string | undefined = readCsrfCookie,
  balance: (token: string, owner: string) => Promise<bigint> = readBaseSepoliaTokenBalance,
): WinningsSendData {
  return {
    async sender(credit) {
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
    tokenBalance: balance,
  };
}

/** Browser-only chain read; cookies, sessions and persona identifiers never reach the RPC provider. */
export async function readBaseSepoliaTokenBalance(token: string, owner: string): Promise<bigint> {
  const client = createPublicClient({ chain: baseSepolia, transport: http(baseSepolia.rpcUrls.default.http[0], {
    retryCount: 0, timeout: 8_000,
    fetchOptions: { credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" },
  }) });
  if (await client.getChainId() !== baseSepolia.id) throw new Error("wallet_network_mismatch");
  return client.readContract({ address: getAddress(token), abi: erc20Abi, functionName: "balanceOf", args: [getAddress(owner)] });
}
