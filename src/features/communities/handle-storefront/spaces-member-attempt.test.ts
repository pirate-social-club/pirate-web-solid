import { afterEach, describe, expect, test, vi } from "vitest";
import type { SessionHandleSalesApiClient } from "../../../api/handle-sales-client.ts";
import type { SupportedHandleOffering } from "./handle-storefront.model.ts";
import { listSpacesMemberAttempts, readSpacesMemberAttempt, runSpacesMemberAttempt, spacesMemberAttemptKey } from "./spaces-member-attempt.ts";

const hash = "a".repeat(64);
const at = "2026-10-20T00:00:00.000Z";
// SAFETY: This runner reads only the immutable acquisition fields provided here.
const offering = { family: "spaces", offering_id: "offering-original", offering_revision: 2, offering_hash: hash,
  sale_namespace_activation_id: "activation-original", sale_namespace_activation_generation: 3,
  namespace_root: "first-root" } as Extract<SupportedHandleOffering, { family: "spaces" }>;
function fixture() {
  const recipient = { kind: "persona_taproot_v1", network: "regtest", script_pubkey_hex: `5120${hash}` } as const;
  const common = { offering_id: offering.offering_id, offering_hash: hash, sale_namespace_activation_id: offering.sale_namespace_activation_id,
    sale_namespace_activation_generation: 3, owner_persona_id: "persona-original", fulfillment: { kind: "spaces_native_v1" },
    handle: { family: "spaces", namespace_root: "first-root", handle_label: "original-name" }, recipient } as const;
  const quote = { ...common, quote_id: "quote-original", quote_hash: hash, offering_revision: 2,
    display_identifier: "original-name@first-root", pricing: { kind: "free_v1", pricing_id: "free", pricing_revision: 1, pricing_hash: hash, atomic_amount: "0" },
    eligibility: { policy_revision: 1, policy_hash: hash, decision: "passed", evidence_use_ids: [], evaluated_at: at },
    status: "quoted", quoted_at: at, expires_at: at } as const;
  const reservation = { ...common, reservation_id: "reservation-original", reservation_hash: hash, quote_id: quote.quote_id,
    quote_hash: hash, status: "reserved", reserved_at: at, expires_at: at } as const;
  const claim = { ...common, claim_id: "claim-original", quote_id: quote.quote_id, reservation_id: reservation.reservation_id,
    reservation_hash: hash, display_identifier: quote.display_identifier, payment: { kind: "not_required_v1", pricing_revision: 1,
      pricing_hash: hash, atomic_amount: "0", status: "not_applicable" }, state: "issuance_pending", delayed: false,
    safe_reason: null, grant: null, created_at: at, updated_at: at } as const;
  const client = {
    get_personas: vi.fn<SessionHandleSalesApiClient["get_personas"]>(),
    post_handlePersonaLinkConfirmations: vi.fn<SessionHandleSalesApiClient["post_handlePersonaLinkConfirmations"]>(async () => ({
      confirmation_id: "confirmation-original", confirmation_hash: hash, persona_id: "persona-original", offering_id: offering.offering_id,
      target_community_id: "community-original", family: "spaces", namespace_root: "first-root", public_linkage_generation: 1,
      persona_public_identity_digest: hash, status: "available", confirmed_at: at, expires_at: at, replayed: false })),
    post_handleQuotes: vi.fn<SessionHandleSalesApiClient["post_handleQuotes"]>(async () => ({ kind: "quoted", quote, replayed: false })),
    post_handleReservations: vi.fn<SessionHandleSalesApiClient["post_handleReservations"]>(async () => ({ reservation, replayed: false })),
    post_handleClaims: vi.fn<SessionHandleSalesApiClient["post_handleClaims"]>(async () => ({ claim, replayed: false })),
    get_handleClaimsClaimId: vi.fn<SessionHandleSalesApiClient["get_handleClaimsClaimId"]>(async () => claim),
  };
  let id = 0;
  const current = vi.fn(() => true);
  const input = { client, storage: localStorage, accountId: "account-original", communityId: "community-original", offering,
    personaId: "persona-original", desiredLabel: "original-name", csrf: "csrf-test", signal: new AbortController().signal,
    current, randomUuid: () => `original-key-${++id}` };
  const key = spacesMemberAttemptKey(input.accountId, input.communityId, offering.sale_namespace_activation_id);
  return { client, input, key, quote, reservation, claim, current };
}
afterEach(() => localStorage.clear());

describe("retained Spaces command owner", () => {
  test.each(["post_handlePersonaLinkConfirmations", "post_handleQuotes", "post_handleReservations", "post_handleClaims"] as const)("lost %s response replays exactly that command after reload", async method => {
    const state = fixture();
    state.client[method].mockRejectedValueOnce(new Error("response lost after possible commit"));
    expect(await runSpacesMemberAttempt(state.input)).toEqual({ kind: "unknown" });
    const first = state.client[method].mock.calls[0]?.[0];
    expect(first).toBeDefined();
    const persisted = localStorage.getItem(state.key);
    expect(persisted).toContain("original-key");
    const randomUuid = vi.fn(() => "must-not-be-used");
    const result = await runSpacesMemberAttempt({ ...state.input, attemptKey: state.key, offering: undefined,
      personaId: "different-persona", desiredLabel: "different-name", randomUuid });
    expect(result.kind).toBe("pending");
    expect(state.client[method].mock.calls[1]?.[0]).toEqual(first);
    expect(randomUuid).not.toHaveBeenCalled();
    expect(state.client.post_handlePersonaLinkConfirmations).toHaveBeenCalledTimes(method === "post_handlePersonaLinkConfirmations" ? 2 : 1);
    expect(state.client.post_handleClaims).toHaveBeenCalledTimes(method === "post_handleClaims" ? 2 : 1);
    expect(JSON.stringify(first)).not.toContain("different-");
  });

  test.each(["post_handlePersonaLinkConfirmations", "post_handleQuotes", "post_handleReservations", "post_handleClaims"] as const)("invalidation while %s is pending prevents every following phase and private result", async method => {
    const state = fixture();
    const original = state.client[method].getMockImplementation();
    if (original === undefined) throw new Error("fixture implementation missing");
    type OriginalResponse = Awaited<ReturnType<SessionHandleSalesApiClient[typeof method]>>;
    // SAFETY: The wrapper forwards the unchanged method-specific arguments to the same typed mock.
    const invoke = original as (...args: readonly unknown[]) => Promise<OriginalResponse>;
    let finish = () => {};
    const pause = new Promise<void>(resolve => { finish = resolve; });
    // SAFETY: This erases only the selected mock setter; its original implementation receives exactly the same arguments.
    const replaceOnce = state.client[method].mockImplementationOnce as (implementation: typeof invoke) => void;
    replaceOnce(async (...args) => { const result = await invoke(...args); await pause; return result; });
    const run = runSpacesMemberAttempt(state.input);
    await vi.waitFor(() => expect(state.client[method]).toHaveBeenCalledTimes(1));
    state.current.mockReturnValue(false); finish();
    expect(await run).toEqual({ kind: "unknown" });
    const order = ["post_handlePersonaLinkConfirmations", "post_handleQuotes", "post_handleReservations", "post_handleClaims"] as const;
    for (const later of order.slice(order.indexOf(method) + 1)) expect(state.client[later]).not.toHaveBeenCalled();
    expect(state.client.get_handleClaimsClaimId).not.toHaveBeenCalled();
  });

  test("each request is durably retained before dispatch and a storage failure dispatches nothing", async () => {
    const state = fixture();
    state.client.post_handleQuotes.mockImplementationOnce(async () => {
      expect(readSpacesMemberAttempt(localStorage, state.key, state.input.accountId, state.input.communityId)?.phase).toBe("quote");
      return { kind: "quoted", quote: state.quote, replayed: false };
    });
    expect((await runSpacesMemberAttempt(state.input)).kind).toBe("pending");
    const other = fixture();
    const broken = { getItem: () => null, setItem: () => { throw new Error("storage full"); } };
    expect(await runSpacesMemberAttempt({ ...other.input, storage: broken })).toEqual({ kind: "unknown" });
    expect(other.client.post_handlePersonaLinkConfirmations).not.toHaveBeenCalled();
  });

  test("missing or malformed retained keys never generate a replacement", async () => {
    const state = fixture();
    const randomUuid = vi.fn(() => "replacement");
    expect(await runSpacesMemberAttempt({ ...state.input, attemptKey: state.key, randomUuid })).toEqual({ kind: "unknown" });
    localStorage.setItem(state.key, JSON.stringify({ version: 1, keys: {} }));
    expect(await runSpacesMemberAttempt({ ...state.input, randomUuid })).toEqual({ kind: "unknown" });
    expect(state.client.post_handlePersonaLinkConfirmations).not.toHaveBeenCalled();
    expect(randomUuid).not.toHaveBeenCalled();
    expect(listSpacesMemberAttempts(localStorage, state.input.accountId)).toEqual({ attempts: [], incomplete: true });
    expect(listSpacesMemberAttempts(localStorage, "account-other")).toEqual({ attempts: [], incomplete: false });
  });

  test("committed claim recovery only reads its original locator without current discovery", async () => {
    const state = fixture();
    await runSpacesMemberAttempt(state.input);
    const randomUuid = vi.fn(() => "replacement");
    await runSpacesMemberAttempt({ ...state.input, offering: undefined, attemptKey: state.key, randomUuid });
    expect(state.client.post_handleClaims).toHaveBeenCalledTimes(1);
    expect(state.client.get_handleClaimsClaimId).toHaveBeenCalledWith({ path: { claimId: "claim-original" } }, expect.objectContaining({ credentials: "same-origin" }));
    expect(randomUuid).not.toHaveBeenCalled();
    expect(listSpacesMemberAttempts(localStorage, state.input.accountId).attempts).toHaveLength(1);
  });

  test("expired or consumed parent replay stays unknown without inventing the next command", async () => {
    for (const status of ["expired", "consumed"] as const) {
      localStorage.clear();
      const state = fixture();
      state.client.post_handleQuotes.mockResolvedValue({ kind: "quoted", quote: { ...state.quote, status }, replayed: true });
      expect(await runSpacesMemberAttempt(state.input)).toEqual({ kind: "unknown" });
      await runSpacesMemberAttempt(state.input);
      expect(state.client.post_handleQuotes.mock.calls[0]?.[0]).toEqual(state.client.post_handleQuotes.mock.calls[1]?.[0]);
      expect(state.client.post_handleReservations).not.toHaveBeenCalled();
      expect(state.client.post_handleClaims).not.toHaveBeenCalled();
    }
  });
});
