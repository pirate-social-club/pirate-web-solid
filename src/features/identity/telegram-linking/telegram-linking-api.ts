import {
  ApiClientError,
  TELEGRAM_IDENTITY_LINK_CONFLICT_REASON,
  type PirateApiClient,
  type GetTelegramLinkResponse,
} from "@pirate/api-client";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions, type ApiClientFactoryOptions } from "../../../api/client";

export type TelegramLinkTransaction = GetTelegramLinkResponse;
export type TelegramLinkAccount = Awaited<ReturnType<PirateApiClient["get_telegramLinkAccount"]>>;
type Client = Pick<PirateApiClient,
  "post_telegramLinkTransactions" | "get_telegramLinkTransactionsTransactionId" |
  "post_telegramLinkCallbackVerify" | "post_telegramLinkTransactionsTransactionIdConfirm" |
  "get_telegramLinkAccount" | "post_telegramLinkGrantsRevoke" | "post_telegramLinkAssociationUnlink">;

export function createTelegramLinkingApi(options: ApiClientFactoryOptions & {
  client?: Client;
  readCsrfToken?: () => string | undefined;
} = {}) {
  let generated = options.client;
  const client = () => generated ??= createSessionApiClient(options);
  const write = (signal?: AbortSignal) => {
    const token = (options.readCsrfToken ?? readCsrfCookie)();
    if (token === undefined) throw new Error("Telegram linking needs a signed-in browser");
    return sessionRequestOptions(token, { signal });
  };
  return {
    start: (reference: string, signal?: AbortSignal) => client().post_telegramLinkTransactions(
      { body: { navigation_reference: reference } }, write(signal)),
    get: (id: string, signal?: AbortSignal) => client().get_telegramLinkTransactionsTransactionId(
      { path: { transactionId: id } }, { signal }),
    verify: (proof: { code: string; state: string }, signal?: AbortSignal) => client().post_telegramLinkCallbackVerify(
      { body: proof }, write(signal)),
    confirm: (id: string, personaId: string, signal?: AbortSignal) => client().post_telegramLinkTransactionsTransactionIdConfirm(
      { path: { transactionId: id }, body: { persona_id: personaId } }, write(signal)),
    list: (signal?: AbortSignal) => client().get_telegramLinkAccount(undefined, { signal }),
    revoke: (communityId: string, botId: string, signal?: AbortSignal) => client().post_telegramLinkGrantsRevoke(
      { body: { community_id: communityId, bot_id: botId } }, write(signal)),
    unlink: (telegramUserId: string, signal?: AbortSignal) => client().post_telegramLinkAssociationUnlink(
      { body: { telegram_user_id: telegramUserId } }, write(signal)),
  };
}
export type TelegramLinkingApi = ReturnType<typeof createTelegramLinkingApi>;
export interface TelegramLinkFailure { message: string; retryable: boolean }

/** Never include a provider response, callback value or another account in copy. */
export function telegramLinkFailure(error: unknown): TelegramLinkFailure {
  if (error instanceof ApiClientError) {
    if (error.status === 409 && error.details?.reason === TELEGRAM_IDENTITY_LINK_CONFLICT_REASON) {
      return { message: "This Telegram account is linked to another Pirate account. Sign in to that account and unlink it in Telegram connections, then start a fresh link from your community bot.", retryable: false };
    }
    if (error.status === 502 || error.status === 429) {
      return { message: "Telegram linking is temporarily unavailable. Wait a moment and try again.", retryable: true };
    }
    if (error.status === 401) {
      return { message: "Your sign-in session changed or ended. Sign in to Pirate, then start a fresh link from your community bot.", retryable: false };
    }
  }
  return { message: "This link could not be completed. It may have expired, been used, or belong to a different browser or session. Return to your community bot, send /study and choose your song again to get a fresh link.", retryable: false };
}
