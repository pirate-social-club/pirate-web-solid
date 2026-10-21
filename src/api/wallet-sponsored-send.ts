import { ApiClientError, type GetWalletSponsoredSendsSendIdResponse } from "@pirate/api-client";
import { getAddress } from "viem";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions, type PirateApiClient } from "./client.ts";
import { baseSepoliaReads } from "./reward-winnings-send.ts";

export type WalletSponsoredSendRecord = GetWalletSponsoredSendsSendIdResponse;

export interface WalletSponsoredSendData {
  sender(personaId: string): Promise<{ address: string; walletIndex: number }>;
  tokenBalance(token: string, owner: string): Promise<bigint>;
  read(personaId: string): Promise<WalletSponsoredSendRecord | null>;
  reserve(personaId: string, recipient: string, amountAtomic: string, idempotencyKey: string): Promise<WalletSponsoredSendRecord>;
  submit(sendId: string, signature: string): Promise<WalletSponsoredSendRecord>;
  issueVerificationIntent(personaId: string): Promise<string>;
}

export function walletSendVerificationRequired(error: unknown, personaId: string): boolean {
  return error instanceof ApiClientError && error.status === 403 && error.code === "verification_required"
    && error.details?.purpose === "wallet_send" && error.details.persona_id === personaId
    && error.details.provider_id === "very.web";
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 404
    && error.code === "not_found" && error.declaredName === "NotFound";
}

/** Session ownership is checked by Pirate; Privy sees no Pirate account token. */
export function createWalletSponsoredSendData(
  client: PirateApiClient = createSessionApiClient(),
  csrf: () => string | undefined = readCsrfCookie,
): WalletSponsoredSendData {
  const write = () => {
    const token = csrf();
    if (token === undefined) throw new Error("wallet_send_csrf_required");
    return sessionRequestOptions(token);
  };
  return {
    async sender(personaId) {
      const { personas } = await client.get_personas(undefined);
      const persona = personas.find(item => item.persona_id === personaId);
      const wallet = persona?.wallet_set.evm;
      if (persona?.status !== "active" || wallet == null) throw new Error("wallet_sender_unavailable");
      return { address: getAddress(wallet.address), walletIndex: wallet.hd_wallet_index };
    },
    tokenBalance: baseSepoliaReads.tokenBalance,
    async read(personaId) {
      try { return await client.get_walletPersonasPersonaIdSponsoredSend({ path: { personaId } }); }
      catch (error) { if (isNotFound(error)) return null; throw error; }
    },
    reserve(personaId, recipient, amountAtomic, idempotencyKey) {
      return client.post_walletPersonasPersonaIdSponsoredSend({
        path: { personaId },
        body: { chain_id: 84_532, recipient, amount_atomic: amountAtomic, idempotency_key: idempotencyKey },
      }, write());
    },
    submit(sendId, signature) {
      return client.post_walletSponsoredSendsSendIdSubmit({
        path: { sendId }, body: { authorization_signature: signature },
      }, write());
    },
    async issueVerificationIntent(personaId) {
      const result = await client.post_walletPersonasPersonaIdSendVerificationIntents({ path: { personaId } }, write());
      return result.intent_id;
    },
  };
}
