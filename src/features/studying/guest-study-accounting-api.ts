import { createPirateApiClient, type PirateApiClient } from "@pirate/api-client";
import { createGeneratedApiClient, readCsrfCookie, sessionRequestOptions, type ApiClientFactoryOptions } from "../../api/client";
import { guestRequestOptions, readGuestCsrfCookie } from "../../api/guest-browser-client";

type Method<Name extends keyof PirateApiClient> = (input: Parameters<PirateApiClient[Name]>[0], signal?: AbortSignal) => ReturnType<PirateApiClient[Name]>;
export interface GuestStudyAccountingApi {
  prepareAttachment: Method<"post_guestAttachmentIntentsIdPrepare">;
  confirmAttachment: Method<"post_guestAttachmentIntentsIdConfirm">;
  getAttachment: Method<"get_usersMeGuestAttachmentsId">;
  selectCreditRecipient: Method<"post_rewardsCreditsCreditIdRecipientSelectionsV1">;
  claimCredit: Method<"post_rewardsCreditsCreditIdOwnerClaimsV1">;
}
export type GuestAttachmentPrepared = Awaited<ReturnType<GuestStudyAccountingApi["prepareAttachment"]>>;
export type GuestAttachmentBinding = Awaited<ReturnType<GuestStudyAccountingApi["confirmAttachment"]>>;
interface Options extends Omit<ApiClientFactoryOptions, "origin" | "sessionRecovery"> {
  origin: string;
  readAccountCsrf?: () => string | undefined;
  readGuestCsrf?: () => string | undefined;
  client?: Pick<PirateApiClient, "post_guestAttachmentIntentsIdPrepare" | "post_guestAttachmentIntentsIdConfirm" | "get_usersMeGuestAttachmentsId" | "post_rewardsCreditsCreditIdRecipientSelectionsV1" | "post_rewardsCreditsCreditIdOwnerClaimsV1">;
}
/** Accounting is never an account-renewal fallback for Guest authority. */
export function createGuestStudyAccountingApi(options: Options): GuestStudyAccountingApi {
  const url = new URL(options.origin);
  if (url.origin !== options.origin || url.protocol !== "https:") throw new Error("Initiating origin required");
  const alive = () => { if (typeof location !== "undefined" && location.origin !== options.origin) throw new Error("Initiating origin changed"); };
  const generated = options.client ?? createGeneratedApiClient(createPirateApiClient, { origin: options.origin, fetchImpl: options.fetchImpl, sessionRecovery: "none" });
  const accountWrite = (signal?: AbortSignal) => {
    alive();
    const csrf = (options.readAccountCsrf ?? readCsrfCookie)();
    if (csrf === undefined) throw new Error("Ordinary account session CSRF required");
    return sessionRequestOptions(csrf, signal === undefined ? {} : { signal });
  };
  const mixedWrite = (signal?: AbortSignal) => {
    const account = accountWrite(signal), csrf = (options.readGuestCsrf ?? readGuestCsrfCookie)();
    if (csrf === undefined) throw new Error("Guest ceremony CSRF required");
    if (!(account.headers instanceof Headers)) throw new Error("Ordinary session headers required");
    guestRequestOptions(csrf);
    const headers = new Headers(account.headers);
    headers.set("x-guest-csrf-token", csrf);
    return { ...account, headers };
  };
  const bounded = (body: unknown) => { if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 4_096) throw new Error("Request too large"); };
  return {
    prepareAttachment: (input, signal) => generated.post_guestAttachmentIntentsIdPrepare(input, accountWrite(signal)),
    confirmAttachment: (input, signal) => { bounded(input.body); return generated.post_guestAttachmentIntentsIdConfirm(input, mixedWrite(signal)); },
    getAttachment: (input, signal) => { alive(); return generated.get_usersMeGuestAttachmentsId(input, { credentials: "same-origin", ...(signal === undefined ? {} : { signal }) }); },
    selectCreditRecipient: (input, signal) => { bounded(input.body); return generated.post_rewardsCreditsCreditIdRecipientSelectionsV1(input, accountWrite(signal)); },
    claimCredit: (input, signal) => { bounded(input.body); return generated.post_rewardsCreditsCreditIdOwnerClaimsV1(input, accountWrite(signal)); },
  };
}
