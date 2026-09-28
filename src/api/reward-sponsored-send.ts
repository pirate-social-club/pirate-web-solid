import type { GetRewardsCreditsCreditIdSponsoredSendResponse } from "@pirate/api-client";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions, type PirateApiClient } from "./client.ts";
import { baseSepoliaReads, type WinnerSendRecord } from "./reward-winnings-send.ts";
import type { RewardCredit } from "./reward-claim.ts";
import { getAddress } from "viem";

export type SponsoredSendRecord = GetRewardsCreditsCreditIdSponsoredSendResponse;

export interface SponsoredSendData {
  sender(credit: RewardCredit): Promise<{ address: string; walletIndex: number }>;
  tokenBalance(token: string, owner: string): Promise<bigint>;
  /** Legacy direct sends remain visible, and the server also forbids a second mode. */
  readDirectSend(creditId: string): Promise<WinnerSendRecord | null>;
  read(creditId: string): Promise<SponsoredSendRecord | null>;
  reserve(creditId: string, recipient: string, amountAtomic: string, idempotencyKey: string): Promise<SponsoredSendRecord>;
  submit(sendId: string, signature: string): Promise<SponsoredSendRecord>;
}

function isNotFound(error: unknown): boolean {
  return error !== null && typeof error === "object" && "status" in error && error.status === 404;
}

/** Account and CSRF come from the current Pirate session; Privy receives no Pirate JWT. */
export function createSponsoredSendData(
  client: PirateApiClient = createSessionApiClient(),
  csrf: () => string | undefined = readCsrfCookie,
): SponsoredSendData {
  const write = () => {
    const token = csrf();
    if (token === undefined) throw new Error("sponsored_send_csrf_required");
    return sessionRequestOptions(token);
  };
  return {
    async sender(credit) {
      const { personas } = await client.get_personas(undefined);
      const persona = personas.find(item => item.persona_id === credit.payout_persona_id);
      const wallet = persona?.wallet_set.evm;
      if (persona?.status !== "active" || wallet == null) throw new Error("winnings_sender_unavailable");
      return { address: getAddress(wallet.address), walletIndex: wallet.hd_wallet_index };
    },
    tokenBalance: baseSepoliaReads.tokenBalance,
    async readDirectSend(creditId) {
      try { return await client.get_rewardsCreditsCreditIdSend({ path: { creditId } }); }
      catch (error) { if (isNotFound(error)) return null; throw error; }
    },
    async read(creditId) {
      try { return await client.get_rewardsCreditsCreditIdSponsoredSend({ path: { creditId } }); }
      catch (error) { if (isNotFound(error)) return null; throw error; }
    },
    reserve(creditId, recipient, amountAtomic, idempotencyKey) {
      return client.post_rewardsCreditsCreditIdSponsoredSend({
        path: { creditId }, body: { recipient, amount_atomic: amountAtomic, idempotency_key: idempotencyKey },
      }, write());
    },
    submit(sendId, signature) {
      return client.post_rewardsSponsoredSendsSendIdSubmit({
        path: { sendId }, body: { authorization_signature: signature },
      }, write());
    },
  };
}
