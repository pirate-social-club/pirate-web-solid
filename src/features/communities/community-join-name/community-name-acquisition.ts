import type { PostHandleClaimsResponse, PostHandlePersonaLinkConfirmationsResponse, PostHandleQuotesResponse, PostHandleReservationsResponse } from "@pirate/api-client";
import type { SessionHandleSalesApiClient } from "../../../api/handle-sales-client.ts";
import { runFreeHandleClaim, createHandleStorefrontAttemptKeys, type HandleStorefrontAttemptKeys, type RunFreeHandleClaimInput } from "../handle-storefront/handle-storefront.flow.ts";
import { isSupportedHandleOffering, type SupportedHnsOffering } from "../handle-storefront/handle-storefront.model.ts";

export interface CommunityNameAttempt {
  readonly accountId: string;
  readonly communityId: string;
  readonly personaId: string;
  readonly offering: SupportedHnsOffering;
  readonly label: string;
  readonly keys: HandleStorefrontAttemptKeys;
  confirmation?: PostHandlePersonaLinkConfirmationsResponse;
  quote?: Extract<PostHandleQuotesResponse, { kind: "quoted" }>;
  reservation?: PostHandleReservationsResponse;
  claim?: PostHandleClaimsResponse;
}

export function communityNameStorageKey(accountId: string, communityId: string): string {
  return `pirate:community-name:v1:${encodeURIComponent(accountId)}:${encodeURIComponent(communityId)}`;
}

export function createCommunityNameAttempt(input: Omit<CommunityNameAttempt, "keys">): CommunityNameAttempt {
  return { ...input, keys: createHandleStorefrontAttemptKeys() };
}

export function readCommunityNameAttempt(storage: Storage, accountId: string, communityId: string): CommunityNameAttempt | undefined {
  const saved = storage.getItem(communityNameStorageKey(accountId, communityId));
  if (saved === null) return undefined;
  const value: unknown = JSON.parse(saved);
  if (typeof value !== "object" || value === null || !("accountId" in value) || value.accountId !== accountId
    || !("communityId" in value) || value.communityId !== communityId) throw new Error("invalid_name_attempt");
  // SAFETY: storage is intent, never issuance authority. The maintained flow revalidates every response.
  const attempt = value as CommunityNameAttempt;
  if (typeof attempt.personaId !== "string" || typeof attempt.label !== "string" || attempt.offering?.community_id !== communityId
    || !isSupportedHandleOffering(attempt.offering) || attempt.offering.family !== "hns"
    || !attempt.keys || [attempt.keys.confirmation, attempt.keys.quote, attempt.keys.reservation, attempt.keys.claim].some(key => typeof key !== "string" || key.length === 0)) throw new Error("invalid_name_attempt");
  return attempt;
}

export function saveCommunityNameAttempt(storage: Storage, attempt: CommunityNameAttempt): void {
  storage.setItem(communityNameStorageKey(attempt.accountId, attempt.communityId), JSON.stringify(attempt));
}

/** Reuse confirmed steps, then read a submitted claim instead of issuing twice. */
export async function runCommunityNameAcquisition(input: {
  readonly client: SessionHandleSalesApiClient;
  readonly attempt: CommunityNameAttempt;
  readonly requestOptions: RunFreeHandleClaimInput["requestOptions"];
  readonly save: (attempt: CommunityNameAttempt) => void;
  readonly maxPolls?: number;
  readonly sleep?: RunFreeHandleClaimInput["sleep"];
}) {
  const attempt = { ...input.attempt };
  const alive = () => input.requestOptions.signal?.throwIfAborted();
  alive();
  input.save(attempt);
  const client: SessionHandleSalesApiClient = {
    ...input.client,
    post_handlePersonaLinkConfirmations: async (body, options) => {
      alive();
      return attempt.confirmation ??= await input.client.post_handlePersonaLinkConfirmations(body, options);
    },
    post_handleQuotes: async (body, options) => {
      alive();
      if (attempt.quote !== undefined) return attempt.quote;
      const result = await input.client.post_handleQuotes(body, options);
      if (result.kind === "quoted") attempt.quote = result;
      return result;
    },
    post_handleReservations: async (body, options) => {
      alive();
      return attempt.reservation ??= await input.client.post_handleReservations(body, options);
    },
    post_handleClaims: async (body, options) => {
      alive();
      if (attempt.claim !== undefined) {
        const claim = await input.client.get_handleClaimsClaimId({ path: { claimId: attempt.claim.claim.claim_id } }, { credentials: "same-origin", signal: options?.signal });
        return { ...attempt.claim, claim };
      }
      return attempt.claim = await input.client.post_handleClaims(body, options);
    },
  };
  const result = await runFreeHandleClaim({ client, requestOptions: input.requestOptions, communityId: attempt.communityId,
    personaId: attempt.personaId, offering: attempt.offering, desiredLabel: attempt.label, linkingConfirmed: true, keys: attempt.keys,
    ...(input.maxPolls === undefined ? {} : { maxPolls: input.maxPolls }), ...(input.sleep === undefined ? {} : { sleep: input.sleep }),
    onProgress: () => { alive(); input.save(attempt); },
  });
  alive();
  if (result.kind === "issued" || result.kind === "pending" || result.kind === "blocked") attempt.claim = { claim: result.claim, replayed: false };
  input.save(attempt);
  return result;
}
