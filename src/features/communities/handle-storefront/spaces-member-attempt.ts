import type { PostHandleQuotesResponse, PostHandleReservationsResponse } from "@pirate/api-client";
import { handleSalesMutationOptions, type SessionHandleSalesApiClient } from "../../../api/handle-sales-client.ts";
import { createHandleStorefrontAttemptKeys, type HandleStorefrontAttemptKeys, type HandleStorefrontProgressUpdate, type HandleStorefrontResult } from "./handle-storefront.flow.ts";
import type { SupportedHandleOffering } from "./handle-storefront.model.ts";

type SpacesOffering = Extract<SupportedHandleOffering, { family: "spaces" }>;
type Quote = Extract<Extract<PostHandleQuotesResponse, { kind: "quoted" }>["quote"], { recipient: unknown }>;
type Reservation = Extract<PostHandleReservationsResponse["reservation"], { recipient: unknown }>;
type Original = Pick<SpacesOffering, "offering_id" | "offering_revision" | "offering_hash" | "sale_namespace_activation_id" | "sale_namespace_activation_generation" | "namespace_root">;
type Phase = "confirmation" | "quote" | "reservation" | "claim" | "read_claim";
export type SpacesMemberAttempt = {
  version: 1;
  accountId: string;
  communityId: string;
  personaId: string;
  desiredLabel: string;
  original: Original;
  keys: HandleStorefrontAttemptKeys;
  phase: Phase;
  quote?: Quote;
  reservation?: Reservation;
  claimId?: string;
};
export type SpacesAttemptStorage = Pick<Storage, "getItem" | "setItem">;
export type SpacesAttemptResult = Exclude<HandleStorefrontResult, { kind: "recipient_wallet_required" }>
  | { readonly kind: "recipient_wallet_required"; readonly originalPersonaId: string } | { readonly kind: "unknown" };
const validId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,256}$/u.test(value);
const hash = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
const phases: readonly string[] = ["confirmation", "quote", "reservation", "claim", "read_claim"];

function assert(value: unknown): asserts value { if (!value) throw new Error("spaces_original_attempt_unknown"); }
function context(progress: Quote | Reservation, record: SpacesMemberAttempt) {
  const original = record.original;
  assert(progress.fulfillment.kind === "spaces_native_v1" && progress.handle.family === "spaces"
    && progress.offering_id === original.offering_id && progress.offering_hash === original.offering_hash
    && progress.sale_namespace_activation_id === original.sale_namespace_activation_id
    && progress.sale_namespace_activation_generation === original.sale_namespace_activation_generation
    && progress.owner_persona_id === record.personaId && progress.handle.namespace_root === original.namespace_root
    && progress.handle.handle_label === record.desiredLabel && progress.recipient.kind === "persona_taproot_v1"
    && ["mainnet", "testnet4", "regtest"].includes(progress.recipient.network)
    && /^5120[0-9a-f]{64}$/u.test(progress.recipient.script_pubkey_hex));
}
function validate(record: SpacesMemberAttempt, accountId: string, communityId: string): void {
  assert(record.version === 1 && record.accountId === accountId && record.communityId === communityId
    && validId(record.accountId) && validId(record.communityId) && validId(record.personaId)
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(record.desiredLabel) && record.desiredLabel.length <= 62
    && !record.desiredLabel.startsWith("xn--") && phases.includes(record.phase));
  const original = record.original;
  assert(validId(original.offering_id) && hash(original.offering_hash) && validId(original.sale_namespace_activation_id)
    && Number.isSafeInteger(original.offering_revision) && original.offering_revision > 0
    && Number.isSafeInteger(original.sale_namespace_activation_generation) && original.sale_namespace_activation_generation > 0
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(original.namespace_root) && original.namespace_root.length <= 62);
  assert([record.keys.confirmation, record.keys.quote, record.keys.reservation, record.keys.claim].every(key => validId(key) && key.length <= 128));
  assert(new Set(Object.values(record.keys)).size === 4);
  if (record.quote !== undefined) {
    context(record.quote, record);
    assert(validId(record.quote.quote_id) && hash(record.quote.quote_hash)
      && record.quote.offering_revision === original.offering_revision
      && record.quote.pricing.kind === "free_v1" && record.quote.pricing.atomic_amount === "0");
  }
  if (record.reservation !== undefined) {
    assert(record.quote !== undefined);
    context(record.reservation, record);
    assert(validId(record.reservation.reservation_id) && hash(record.reservation.reservation_hash)
      && record.reservation.quote_id === record.quote.quote_id && record.reservation.quote_hash === record.quote.quote_hash
      && record.reservation.recipient.network === record.quote.recipient.network
      && record.reservation.recipient.script_pubkey_hex === record.quote.recipient.script_pubkey_hex);
  }
  assert((record.phase !== "reservation" || record.quote !== undefined)
    && (record.phase !== "claim" || record.reservation !== undefined)
    && (record.phase !== "read_claim" || (validId(record.claimId) && record.reservation !== undefined)));
}

export function spacesMemberAttemptKey(accountId: string, communityId: string, activationId: string): string {
  return `spaces-member-attempt:v1:${encodeURIComponent(accountId)}:${encodeURIComponent(communityId)}:${encodeURIComponent(activationId)}`;
}

export function listSpacesMemberAttempts(storage: Storage, accountId: string) {
  const prefix = `spaces-member-attempt:v1:${encodeURIComponent(accountId)}:`;
  const attempts: Array<{ key: string; record: SpacesMemberAttempt }> = [];
  let incomplete = storage.length > 1_000;
  for (let index = 0; index < Math.min(storage.length, 1_000); index++) {
    const key = storage.key(index);
    if (key === null || !key.startsWith(prefix)) continue;
    try {
      const communityId = decodeURIComponent(key.slice(prefix.length).split(":")[0] ?? "");
      const record = readSpacesMemberAttempt(storage, key, accountId, communityId);
      if (record === null || key !== spacesMemberAttemptKey(accountId, communityId, record.original.sale_namespace_activation_id)) throw new Error("invalid_attempt_locator");
      attempts.push({ key, record });
    } catch { incomplete = true; }
  }
  return { attempts, incomplete };
}

/** Local intent is correlation only. An unreadable retained attempt never admits a replacement. */
export function readSpacesMemberAttempt(storage: SpacesAttemptStorage, key: string, accountId: string, communityId: string): SpacesMemberAttempt | null {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  assert(raw.length <= 32_768);
  // SAFETY: No parsed field is used until the original scope and phase are validated below.
  const record = JSON.parse(raw) as SpacesMemberAttempt;
  validate(record, accountId, communityId);
  return record;
}

/** Persist each complete original command before dispatch; never rotate a retained key. */
export async function runSpacesMemberAttempt(input: {
  readonly client: SessionHandleSalesApiClient;
  readonly storage: SpacesAttemptStorage;
  readonly accountId: string;
  readonly communityId: string;
  readonly offering?: SpacesOffering;
  readonly personaId?: string;
  readonly desiredLabel?: string;
  readonly attemptKey?: string;
  readonly csrf: string;
  readonly signal: AbortSignal;
  readonly current: () => boolean;
  readonly onProgress?: (update: HandleStorefrontProgressUpdate) => void;
  readonly randomUuid?: () => string;
}): Promise<SpacesAttemptResult> {
  const alive = () => { assert(input.current() && !input.signal.aborted); };
  try {
    alive();
    const options = handleSalesMutationOptions(input.csrf, { signal: input.signal });
    assert(input.attemptKey !== undefined || input.offering !== undefined);
    const key = input.attemptKey ?? spacesMemberAttemptKey(input.accountId, input.communityId, input.offering?.sale_namespace_activation_id ?? "");
    let record = readSpacesMemberAttempt(input.storage, key, input.accountId, input.communityId);
    if (record === null) {
      const offering = input.offering;
      assert(input.attemptKey === undefined && offering !== undefined && input.personaId !== undefined && input.desiredLabel !== undefined);
      record = { version: 1, accountId: input.accountId, communityId: input.communityId,
        personaId: input.personaId, desiredLabel: input.desiredLabel, phase: "confirmation",
        keys: createHandleStorefrontAttemptKeys(input.randomUuid), original: {
          offering_id: offering.offering_id, offering_revision: offering.offering_revision, offering_hash: offering.offering_hash,
          sale_namespace_activation_id: offering.sale_namespace_activation_id,
          sale_namespace_activation_generation: offering.sale_namespace_activation_generation, namespace_root: offering.namespace_root,
        } };
    }
    const retained = record;
    assert(key === spacesMemberAttemptKey(input.accountId, input.communityId, retained.original.sale_namespace_activation_id));
    const persist = () => { alive(); validate(retained, input.accountId, input.communityId); input.storage.setItem(key, JSON.stringify(retained)); alive(); };
    persist();
    if (retained.phase === "confirmation") {
      input.onProgress?.({ progress: "confirming_link" });
      alive();
      const confirmation = await input.client.post_handlePersonaLinkConfirmations({ body: {
        idempotency_key: retained.keys.confirmation, persona_id: retained.personaId,
        offering_id: retained.original.offering_id, confirmed: true,
      } }, options);
      alive();
      assert(confirmation.status === "available" && confirmation.persona_id === retained.personaId
        && confirmation.offering_id === retained.original.offering_id && confirmation.target_community_id === retained.communityId
        && confirmation.family === "spaces" && confirmation.namespace_root === retained.original.namespace_root);
      retained.phase = "quote"; persist();
    }
    if (retained.phase === "quote") {
      input.onProgress?.({ progress: "quoting" });
      alive();
      const quoted = await input.client.post_handleQuotes({ body: { idempotency_key: retained.keys.quote,
        persona_id: retained.personaId, offering_id: retained.original.offering_id, desired_label: retained.desiredLabel } }, options);
      alive();
      if (quoted.kind !== "quoted") {
        assert(quoted.offering_id === retained.original.offering_id && quoted.owner_persona_id === retained.personaId);
        if (quoted.kind === "recipient_wallet_required") return { kind: "recipient_wallet_required", originalPersonaId: retained.personaId };
        if (quoted.kind === "eligibility_required") return { kind: "eligibility_required", reason: quoted.reason };
        return { kind: "unknown" };
      }
      assert("recipient" in quoted.quote);
      retained.quote = quoted.quote; validate(retained, input.accountId, input.communityId);
      if (quoted.quote.status !== "quoted") { persist(); return { kind: "unknown" }; }
      retained.phase = "reservation"; persist();
    }
    if (retained.phase === "reservation") {
      const quote = retained.quote; assert(quote !== undefined);
      input.onProgress?.({ progress: "reserving", expiresAt: quote.expires_at });
      alive();
      const reserved = await input.client.post_handleReservations({ body: { idempotency_key: retained.keys.reservation,
        persona_id: retained.personaId, quote_id: quote.quote_id, expected_quote_hash: quote.quote_hash } }, options);
      alive();
      assert("recipient" in reserved.reservation);
      retained.reservation = reserved.reservation; validate(retained, input.accountId, input.communityId);
      if (reserved.reservation.status !== "reserved") { persist(); return { kind: "unknown" }; }
      retained.phase = "claim"; persist();
    }
    const reservation = retained.reservation; assert(reservation !== undefined);
    input.onProgress?.({ progress: retained.phase === "claim" ? "claiming" : "waiting_for_issuance" });
    alive();
    const claim = retained.phase === "read_claim"
      ? await input.client.get_handleClaimsClaimId({ path: { claimId: retained.claimId ?? "" } }, { credentials: "same-origin", signal: input.signal })
      : (await input.client.post_handleClaims({ body: { idempotency_key: retained.keys.claim, persona_id: retained.personaId,
        reservation_id: reservation.reservation_id, expected_reservation_hash: reservation.reservation_hash } }, options)).claim;
    alive();
    assert(claim.fulfillment.kind === "spaces_native_v1" && claim.handle.family === "spaces" && "recipient" in claim);
    assert(claim.owner_persona_id === retained.personaId && claim.offering_id === retained.original.offering_id
      && claim.offering_hash === retained.original.offering_hash && claim.reservation_id === reservation.reservation_id
      && claim.reservation_hash === reservation.reservation_hash && claim.quote_id === reservation.quote_id
      && claim.sale_namespace_activation_id === retained.original.sale_namespace_activation_id
      && claim.sale_namespace_activation_generation === retained.original.sale_namespace_activation_generation
      && claim.handle.namespace_root === retained.original.namespace_root && claim.handle.handle_label === retained.desiredLabel
      && claim.recipient.network === reservation.recipient.network && claim.recipient.script_pubkey_hex === reservation.recipient.script_pubkey_hex
      && (retained.claimId === undefined || retained.claimId === claim.claim_id));
    retained.claimId = claim.claim_id; retained.phase = "read_claim"; persist();
    if (claim.state === "issued" && claim.grant?.status === "active") {
      assert(claim.grant.community_id === retained.communityId && claim.grant.claim_id === claim.claim_id
        && claim.grant.owner_persona_id === retained.personaId && claim.grant.offering_id === retained.original.offering_id
        && claim.grant.offering_hash === retained.original.offering_hash && claim.grant.fulfillment.kind === "spaces_native_v1"
        && claim.grant.sale_namespace_activation_id === retained.original.sale_namespace_activation_id
        && claim.grant.sale_namespace_activation_generation === retained.original.sale_namespace_activation_generation
        && claim.grant.handle.namespace_root === retained.original.namespace_root && claim.grant.handle.handle_label === retained.desiredLabel);
      return { kind: "issued", claim, grant: claim.grant };
    }
    if (claim.state === "issuance_pending") return { kind: "pending", claim };
    return { kind: "unknown" };
  } catch {
    // A failed request or local write cannot establish that a command did not commit.
    return { kind: "unknown" };
  }
}
