import type {
  GetHandleClaimsClaimIdResponse,
  PirateApiRequestOptions,
  PostHandleClaimsResponse,
  PostHandlePersonaLinkConfirmationsResponse,
  PostHandleQuotesResponse,
  PostHandleReservationsResponse,
} from "@pirate/api-client-handle-sales";

import type { SessionHandleSalesApiClient } from "../../../api/handle-sales-client.ts";
import type { SupportedHandleOffering } from "./handle-storefront.model.ts";

export type HandleClaim = PostHandleClaimsResponse["claim"];
export type HandleGrant = NonNullable<HandleClaim["grant"]>;

export type HandleStorefrontProgress =
  | "confirming_link"
  | "quoting"
  | "reserving"
  | "claiming"
  | "waiting_for_issuance";

export type HandleStorefrontResult =
  | Readonly<{
      readonly kind: "issued";
      readonly claim: HandleClaim;
      readonly grant: HandleGrant;
    }>
  | Readonly<{
      readonly kind: "pending";
      readonly claim: HandleClaim;
    }>
  | Readonly<{
      readonly kind: "blocked";
      readonly claim: HandleClaim;
      readonly reason: NonNullable<HandleClaim["safe_reason"]>;
    }>
  | Readonly<{
      readonly kind: "eligibility_required";
      readonly reason: "evidence_required" | "qualification_unsatisfied";
    }>;

export type HandleStorefrontAttemptKeys = Readonly<{
  readonly confirmation: string;
  readonly quote: string;
  readonly reservation: string;
  readonly claim: string;
}>;

export interface RunFreeHandleClaimInput {
  readonly client: SessionHandleSalesApiClient;
  readonly requestOptions: PirateApiRequestOptions;
  readonly communityId: string;
  readonly offering: SupportedHandleOffering;
  readonly personaId: string;
  readonly desiredLabel: string;
  readonly linkingConfirmed: true;
  readonly keys: HandleStorefrontAttemptKeys;
  readonly onProgress?: (progress: HandleStorefrontProgress) => void;
  readonly maxPolls?: number;
  readonly pollIntervalMs?: number;
  readonly sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

export class HandleStorefrontProtocolError extends Error {
  readonly _tag = "HandleStorefrontProtocolError" as const;

  constructor() {
    super("Handle storefront response did not match the requested acquisition");
    this.name = "HandleStorefrontProtocolError";
  }
}

export function createHandleStorefrontAttemptKeys(
  randomUuid: () => string = () => crypto.randomUUID(),
): HandleStorefrontAttemptKeys {
  return {
    confirmation: randomUuid(),
    quote: randomUuid(),
    reservation: randomUuid(),
    claim: randomUuid(),
  };
}

function assert(value: boolean): asserts value {
  if (!value) throw new HandleStorefrontProtocolError();
}

function sameFulfillment(
  left: Readonly<{ readonly kind: string }>,
  right: Readonly<{ readonly kind: string }>,
): boolean {
  return left.kind === right.kind;
}

function sameHandle(
  left: Readonly<{ readonly family: string; readonly namespace_root: string; readonly handle_label: string }>,
  right: Readonly<{ readonly family: string; readonly namespace_root: string; readonly handle_label: string }>,
): boolean {
  return left.family === right.family
    && left.namespace_root === right.namespace_root
    && left.handle_label === right.handle_label;
}

function validateConfirmation(
  confirmation: PostHandlePersonaLinkConfirmationsResponse,
  input: RunFreeHandleClaimInput,
): void {
  assert(
    confirmation.persona_id === input.personaId
    && confirmation.offering_id === input.offering.offering_id
    && confirmation.target_community_id === input.communityId
    && confirmation.family === input.offering.family
    && confirmation.namespace_root === input.offering.namespace_root
    && confirmation.status === "available",
  );
}

function validateQuote(
  response: Extract<PostHandleQuotesResponse, { readonly kind: "quoted" }>,
  input: RunFreeHandleClaimInput,
): void {
  const quote = response.quote;
  assert(
    quote.owner_persona_id === input.personaId
    && quote.offering_id === input.offering.offering_id
    && quote.offering_revision === input.offering.offering_revision
    && quote.offering_hash === input.offering.offering_hash
    && quote.sale_namespace_activation_id === input.offering.sale_namespace_activation_id
    && quote.sale_namespace_activation_generation === input.offering.sale_namespace_activation_generation
    && sameFulfillment(quote.fulfillment, input.offering.fulfillment)
    && sameHandle(quote.handle, {
      family: input.offering.family,
      namespace_root: input.offering.namespace_root,
      handle_label: input.desiredLabel,
    })
    && quote.pricing.kind === "free_v1"
    && quote.pricing.atomic_amount === "0"
    && quote.status === "quoted",
  );
}

function validateReservation(
  response: PostHandleReservationsResponse,
  quote: Extract<PostHandleQuotesResponse, { readonly kind: "quoted" }>["quote"],
): void {
  const reservation = response.reservation;
  assert(
    reservation.quote_id === quote.quote_id
    && reservation.quote_hash === quote.quote_hash
    && reservation.offering_id === quote.offering_id
    && reservation.offering_hash === quote.offering_hash
    && reservation.sale_namespace_activation_id === quote.sale_namespace_activation_id
    && reservation.sale_namespace_activation_generation === quote.sale_namespace_activation_generation
    && reservation.owner_persona_id === quote.owner_persona_id
    && sameFulfillment(reservation.fulfillment, quote.fulfillment)
    && sameHandle(reservation.handle, quote.handle)
    && reservation.status === "reserved",
  );
}

function validateClaim(
  claim: HandleClaim | GetHandleClaimsClaimIdResponse,
  quote: Extract<PostHandleQuotesResponse, { readonly kind: "quoted" }>["quote"],
  reservation: PostHandleReservationsResponse["reservation"],
  communityId: string,
): HandleClaim {
  assert(
    claim.owner_persona_id === quote.owner_persona_id
    && claim.offering_id === quote.offering_id
    && claim.offering_hash === quote.offering_hash
    && claim.quote_id === quote.quote_id
    && claim.reservation_id === reservation.reservation_id
    && claim.reservation_hash === reservation.reservation_hash
    && claim.sale_namespace_activation_id === quote.sale_namespace_activation_id
    && claim.sale_namespace_activation_generation === quote.sale_namespace_activation_generation
    && sameFulfillment(claim.fulfillment, quote.fulfillment)
    && sameHandle(claim.handle, quote.handle)
    && claim.display_identifier === quote.display_identifier
    && claim.payment.kind === "not_required_v1"
    && claim.payment.atomic_amount === "0"
    && claim.payment.status === "not_applicable",
  );

  if (claim.state === "issued") {
    assert(
      claim.safe_reason === null
      && claim.grant !== null
      && claim.grant.status === "active"
      && claim.grant.community_id === communityId
      && claim.grant.offering_id === quote.offering_id
      && claim.grant.offering_hash === quote.offering_hash
      && claim.grant.claim_id === claim.claim_id
      && claim.grant.owner_persona_id === quote.owner_persona_id
      && claim.grant.sale_namespace_activation_id === quote.sale_namespace_activation_id
      && claim.grant.sale_namespace_activation_generation === quote.sale_namespace_activation_generation
      && sameFulfillment(claim.grant.fulfillment, quote.fulfillment)
      && sameHandle(claim.grant.handle, quote.handle)
      && claim.grant.display_identifier === quote.display_identifier,
    );
  } else {
    assert(claim.grant === null);
  }
  return claim;
}

function resultFor(claim: HandleClaim): HandleStorefrontResult | undefined {
  if (claim.state === "issued") {
    assert(claim.grant !== null);
    return { kind: "issued", claim, grant: claim.grant };
  }
  if (claim.state === "blocked" || claim.state === "issuance_failed") {
    assert(claim.safe_reason !== null);
    return { kind: "blocked", claim, reason: claim.safe_reason };
  }
  return undefined;
}

function defaultSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("The operation was aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Execute the ratified free-only sequence; every response is correlation-checked. */
export async function runFreeHandleClaim(
  input: RunFreeHandleClaimInput,
): Promise<HandleStorefrontResult> {
  input.onProgress?.("confirming_link");
  const confirmation = await input.client.post_handlePersonaLinkConfirmations({
    body: {
      idempotency_key: input.keys.confirmation,
      persona_id: input.personaId,
      offering_id: input.offering.offering_id,
      confirmed: input.linkingConfirmed,
    },
  }, input.requestOptions);
  validateConfirmation(confirmation, input);

  input.onProgress?.("quoting");
  const quoteResult = await input.client.post_handleQuotes({
    body: {
      idempotency_key: input.keys.quote,
      persona_id: input.personaId,
      offering_id: input.offering.offering_id,
      desired_label: input.desiredLabel,
    },
  }, input.requestOptions);
  if (quoteResult.kind === "eligibility_required") {
    assert(
      quoteResult.offering_id === input.offering.offering_id
      && quoteResult.owner_persona_id === input.personaId,
    );
    return { kind: "eligibility_required", reason: quoteResult.reason };
  }
  validateQuote(quoteResult, input);

  input.onProgress?.("reserving");
  const reservation = await input.client.post_handleReservations({
    body: {
      idempotency_key: input.keys.reservation,
      persona_id: input.personaId,
      quote_id: quoteResult.quote.quote_id,
      expected_quote_hash: quoteResult.quote.quote_hash,
    },
  }, input.requestOptions);
  validateReservation(reservation, quoteResult.quote);

  input.onProgress?.("claiming");
  const submitted = await input.client.post_handleClaims({
    body: {
      idempotency_key: input.keys.claim,
      persona_id: input.personaId,
      reservation_id: reservation.reservation.reservation_id,
      expected_reservation_hash: reservation.reservation.reservation_hash,
    },
  }, input.requestOptions);
  let claim = validateClaim(
    submitted.claim,
    quoteResult.quote,
    reservation.reservation,
    input.communityId,
  );
  const settled = resultFor(claim);
  if (settled !== undefined) return settled;

  input.onProgress?.("waiting_for_issuance");
  const signal = input.requestOptions.signal;
  const sleep = input.sleep ?? defaultSleep;
  const maxPolls = input.maxPolls ?? 8;
  for (let poll = 0; poll < maxPolls; poll += 1) {
    await sleep(input.pollIntervalMs ?? 1_500, signal);
    const pollOptions: PirateApiRequestOptions = signal === undefined
      ? { credentials: "same-origin" }
      : { credentials: "same-origin", signal };
    claim = validateClaim(
      await input.client.get_handleClaimsClaimId(
        { path: { claimId: claim.claim_id } },
        pollOptions,
      ),
      quoteResult.quote,
      reservation.reservation,
      input.communityId,
    );
    const result = resultFor(claim);
    if (result !== undefined) return result;
  }
  return { kind: "pending", claim };
}
