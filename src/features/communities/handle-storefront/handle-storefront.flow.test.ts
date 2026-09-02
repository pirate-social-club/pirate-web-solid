import type {
  PostHandleClaimsResponse,
  PostHandlePersonaLinkConfirmationsResponse,
  PostHandleQuotesResponse,
  PostHandleReservationsResponse,
} from "@pirate/api-client-happy-path";
import { describe, expect, test, vi } from "vitest";

import type { SessionHandleSalesApiClient } from "../../../api/handle-sales-client.ts";
import {
  HandleStorefrontProtocolError,
  createHandleStorefrontAttemptKeys,
  runFreeHandleClaim,
} from "./handle-storefront.flow.ts";
import type { SupportedHandleOffering } from "./handle-storefront.model.ts";

const communityId = "community-public";
const offering = {
  offering_id: "offering-1",
  offering_revision: 1,
  offering_hash: "offering-hash",
  community_id: communityId,
  family: "hns",
  namespace_root: "charizard",
  display_root: "charizard",
  sale_namespace_activation_id: "activation-1",
  sale_namespace_activation_generation: 3,
  label_scope: {
    kind: "label_rule_v2",
    label_grammar_id: "hns_ascii_ldh_1_63_v1",
    reserved_labels_id: "reserved-1",
    reserved_labels_revision: 1,
    reserved_labels_hash: "reserved-hash",
    availability: { kind: "length_band_v1", min_label_length: 8, max_label_length: 32 },
  },
  allocation: { kind: "first_come_v1" },
  max_active_grants_per_account: 1,
  fulfillment: { kind: "hosted_persona_v1" },
  qualification_policy: { kind: "none_v1", policy_id: "policy-1", policy_revision: 1, policy_hash: "policy-hash" },
  pricing: { kind: "free_v1", pricing_id: "free-1", pricing_revision: 1, pricing_hash: "price-hash", atomic_amount: "0" },
  issuance: { family: "hns", driver_id: "hosted-persona-local", driver_version: "1" },
  quote_ttl_seconds: 120,
  reservation_ttl_seconds: 300,
  status: "active",
  created_at: "2026-08-26T12:00:00.000Z",
} as const satisfies SupportedHandleOffering;

const personaId = "persona-public-1";
const label = "longname";
const confirmation = {
  confirmation_id: "confirmation-1",
  confirmation_hash: "confirmation-hash",
  persona_id: personaId,
  offering_id: offering.offering_id,
  target_community_id: communityId,
  family: "hns",
  namespace_root: "charizard",
  public_linkage_generation: 4,
  persona_public_identity_digest: "persona-digest",
  status: "available",
  confirmed_at: "2026-08-26T12:00:00.000Z",
  expires_at: "2026-08-26T12:10:00.000Z",
  replayed: false,
} as const satisfies PostHandlePersonaLinkConfirmationsResponse;
const quote = {
  kind: "quoted",
  quote: {
    quote_id: "quote-1",
    quote_hash: "quote-hash",
    offering_id: offering.offering_id,
    offering_revision: 1,
    offering_hash: offering.offering_hash,
    sale_namespace_activation_id: offering.sale_namespace_activation_id,
    sale_namespace_activation_generation: 3,
    fulfillment: { kind: "hosted_persona_v1" },
    owner_persona_id: personaId,
    handle: { family: "hns", namespace_root: "charizard", handle_label: label },
    display_identifier: `${label}.charizard`,
    pricing: { kind: "free_v1", pricing_id: "free-1", pricing_revision: 1, pricing_hash: "price-hash", atomic_amount: "0" },
    eligibility: { policy_revision: 1, policy_hash: "policy-hash", decision: "passed", evidence_use_ids: [], evaluated_at: "2026-08-26T12:00:00.000Z" },
    status: "quoted",
    quoted_at: "2026-08-26T12:00:00.000Z",
    expires_at: "2026-08-26T12:02:00.000Z",
  },
  replayed: false,
} as const satisfies PostHandleQuotesResponse;
const reservation = {
  reservation: {
    reservation_id: "reservation-1",
    reservation_hash: "reservation-hash",
    quote_id: "quote-1",
    quote_hash: "quote-hash",
    offering_id: offering.offering_id,
    offering_hash: offering.offering_hash,
    sale_namespace_activation_id: offering.sale_namespace_activation_id,
    sale_namespace_activation_generation: 3,
    fulfillment: { kind: "hosted_persona_v1" },
    owner_persona_id: personaId,
    handle: { family: "hns", namespace_root: "charizard", handle_label: label },
    status: "reserved",
    reserved_at: "2026-08-26T12:00:00.000Z",
    expires_at: "2026-08-26T12:05:00.000Z",
  },
  replayed: false,
} as const satisfies PostHandleReservationsResponse;

function claim(state: "issuance_pending" | "issued" | "blocked" = "issued"): PostHandleClaimsResponse["claim"] {
  const grant = state === "issued" ? {
    grant_id: "grant-1",
    grant_generation: 1,
    community_id: communityId,
    offering_id: offering.offering_id,
    offering_hash: offering.offering_hash,
    claim_id: "claim-1",
    owner_persona_id: personaId,
    sale_namespace_activation_id: offering.sale_namespace_activation_id,
    sale_namespace_activation_generation: 3,
    fulfillment: { kind: "hosted_persona_v1" as const },
    handle: { family: "hns" as const, namespace_root: "charizard", handle_label: label },
    display_identifier: `${label}.charizard`,
    status: "active" as const,
    issued_at: "2026-08-26T12:00:01.000Z",
  } : null;
  return {
    claim_id: "claim-1",
    owner_persona_id: personaId,
    offering_id: offering.offering_id,
    offering_hash: offering.offering_hash,
    quote_id: "quote-1",
    reservation_id: "reservation-1",
    reservation_hash: "reservation-hash",
    sale_namespace_activation_id: offering.sale_namespace_activation_id,
    sale_namespace_activation_generation: 3,
    fulfillment: { kind: "hosted_persona_v1" },
    handle: { family: "hns", namespace_root: "charizard", handle_label: label },
    display_identifier: `${label}.charizard`,
    payment: { kind: "not_required_v1", pricing_revision: 1, pricing_hash: "price-hash", atomic_amount: "0", status: "not_applicable" },
    state,
    safe_reason: state === "blocked" ? "handle_unavailable" : null,
    grant,
    created_at: "2026-08-26T12:00:00.000Z",
    updated_at: "2026-08-26T12:00:01.000Z",
  };
}

function client(submitted: PostHandleClaimsResponse["claim"]): SessionHandleSalesApiClient {
  return {
    post_handlePersonaLinkConfirmations: vi.fn(async () => confirmation),
    post_handleQuotes: vi.fn(async () => quote),
    post_handleReservations: vi.fn(async () => reservation),
    post_handleClaims: vi.fn(async () => ({ claim: submitted, replayed: false })),
    get_handleClaimsClaimId: vi.fn(async () => submitted),
    get_personas: vi.fn(async () => ({ personas: [] })),
  };
}

function input(apiClient: SessionHandleSalesApiClient) {
  return {
    client: apiClient,
    requestOptions: { credentials: "same-origin" as const, headers: { "x-csrf-token": "csrf" } },
    communityId,
    offering,
    personaId,
    desiredLabel: label,
    linkingConfirmed: true as const,
    keys: { confirmation: "link-key", quote: "quote-key", reservation: "reserve-key", claim: "claim-key" },
  };
}

describe("free handle storefront flow", () => {
  test("runs confirmation, quote, reservation, and claim with exact immutable parents", async () => {
    const apiClient = client(claim("issued"));
    await expect(runFreeHandleClaim(input(apiClient))).resolves.toMatchObject({
      kind: "issued",
      grant: { display_identifier: "longname.charizard" },
    });
    expect(apiClient.post_handlePersonaLinkConfirmations).toHaveBeenCalledWith({ body: {
      idempotency_key: "link-key",
      persona_id: personaId,
      offering_id: offering.offering_id,
      confirmed: true,
    } }, input(apiClient).requestOptions);
    expect(apiClient.post_handleReservations).toHaveBeenCalledWith({ body: {
      idempotency_key: "reserve-key",
      persona_id: personaId,
      quote_id: "quote-1",
      expected_quote_hash: "quote-hash",
    } }, input(apiClient).requestOptions);
  });

  test("surfaces each server expiry with the step that consumes it", async () => {
    const apiClient = client(claim("issued"));
    const progress: unknown[] = [];
    await runFreeHandleClaim({
      ...input(apiClient),
      onProgress: update => progress.push(update),
    });
    expect(progress).toEqual([
      { progress: "confirming_link" },
      { progress: "quoting", expiresAt: confirmation.expires_at },
      { progress: "reserving", expiresAt: quote.quote.expires_at },
      { progress: "claiming", expiresAt: reservation.reservation.expires_at },
    ]);
  });

  test("polls a durable pending claim and validates the issued projection", async () => {
    const apiClient = client(claim("issuance_pending"));
    apiClient.get_handleClaimsClaimId = vi.fn(async () => claim("issued"));
    await expect(runFreeHandleClaim({
      ...input(apiClient),
      sleep: async () => undefined,
      pollIntervalMs: 0,
    })).resolves.toMatchObject({ kind: "issued" });
    expect(apiClient.get_handleClaimsClaimId).toHaveBeenCalledWith(
      { path: { claimId: "claim-1" } },
      { credentials: "same-origin" },
    );
  });

  test("stops before reservation when account eligibility is not satisfied", async () => {
    const apiClient = client(claim("issued"));
    apiClient.post_handleQuotes = vi.fn(async () => ({
      kind: "eligibility_required",
      offering_id: offering.offering_id,
      owner_persona_id: personaId,
      reason: "evidence_required",
    } satisfies PostHandleQuotesResponse));
    await expect(runFreeHandleClaim(input(apiClient))).resolves.toEqual({
      kind: "eligibility_required",
      reason: "evidence_required",
    });
    expect(apiClient.post_handleReservations).not.toHaveBeenCalled();
  });

  test("fails closed when any response changes the selected persona or handle", async () => {
    const apiClient = client(claim("issued"));
    apiClient.post_handleClaims = vi.fn(async () => ({
      claim: { ...claim("issued"), owner_persona_id: "persona-sibling" },
      replayed: false,
    }));
    await expect(runFreeHandleClaim(input(apiClient))).rejects.toBeInstanceOf(HandleStorefrontProtocolError);
  });

  test("creates four independent cryptographic idempotency keys", () => {
    let ordinal = 0;
    expect(createHandleStorefrontAttemptKeys(() => `uuid-${++ordinal}`)).toEqual({
      confirmation: "uuid-1",
      quote: "uuid-2",
      reservation: "uuid-3",
      claim: "uuid-4",
    });
  });
});
