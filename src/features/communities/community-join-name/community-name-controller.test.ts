import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, type GetPersonasPersonaIdHandleGrantsResponse, type GetHandleClaimsClaimIdResponse } from "@pirate/api-client";
import { createCommunityNameController, type CommunityNameControllerOptions } from "./community-name-controller.ts";
import { readCommunityNameAttempt } from "./community-name-acquisition.ts";
import { communityId, offering, personaId, label, confirmation, quote, reservation, claim } from "./community-name-test-fixtures.ts";
import type { PublicHandleGrantApiClient, SessionHandleSalesApiClient } from "../../../api/handle-sales-client.ts";
import { toast } from "../../../design-system.ts";
import { getLocaleMessages } from "../../../locales/index.ts";

const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); sessionStorage.clear(); });
const publicGrant = (): Extract<GetPersonasPersonaIdHandleGrantsResponse["items"][number], { handle: { family: "hns" } }> => ({ grant_id: "grant-1", grant_generation: 1, community_id: communityId,
  owner_persona: { persona_id: personaId, object: "persona", display_name: null, avatar_ref: null, primary_public_handle: `${label}.charizard` },
  sale_namespace_activation_id: offering.sale_namespace_activation_id, sale_namespace_activation_generation: 3, fulfillment: { kind: "hosted_persona_v1" },
  handle: { family: "hns", namespace_root: "charizard", handle_label: label }, display_identifier: `${label}.charizard`,
  host: { kind: "available", normalized_host: `${label}.charizard`, sale_namespace_activation_generation: 3, grant_generation: 1 }, issued_at: "2026-08-26T12:00:01Z" });

async function setup(input: { api?: SessionHandleSalesApiClient; grants?: GetPersonasPersonaIdHandleGrantsResponse["items"]; host?: GetPersonasPersonaIdHandleGrantsResponse["items"][number]; publicClient?: CommunityNameControllerOptions["publicClient"]; csrf?: CommunityNameControllerOptions["csrf"] } = {}) {
  const api: SessionHandleSalesApiClient = input.api ?? { get_personas: vi.fn(async () => ({ personas: [] })), get_handleClaimsClaimId: vi.fn(async () => claim()),
    post_handlePersonaLinkConfirmations: vi.fn(async () => confirmation), post_handleQuotes: vi.fn(async () => quote), post_handleReservations: vi.fn(async () => reservation), post_handleClaims: vi.fn(async () => ({ claim: claim("issuance_pending"), replayed: false })) };
  const grantClient: PublicHandleGrantApiClient = { get_personasPersonaIdHandleGrants: vi.fn(async () => ({ items: input.grants ?? [], next_cursor: null })),
    get_handlesFamilyNamespaceRootHandleLabel: vi.fn(async () => input.host ?? publicGrant()) };
  const prepare = vi.fn(async () => ({ personaId, displayName: null, avatarRef: null, primaryPublicHandle: null, communityBinding: { communityId, bindingSource: "first_membership" as const } }));
  const refresh = vi.fn();
  let setAccount!: (account: string | null) => void;
  const controller = createRoot(dispose => {
    disposers.push(dispose);
    const [account, change] = createSignal<string | null>("account"); setAccount = change;
    return createCommunityNameController({ communityId, root: "charizard", accountId: account, joined: () => true, preferredPersonaId: () => personaId,
      publicClient: input.publicClient ?? { get_communitiesCommunityIdHandleOfferings: vi.fn(async () => ({ items: [offering], next_cursor: null })) },
      resolve: async () => ({ status: "authenticated", userId: account() ?? "signed-out", personas: [{ personaId, displayName: null, avatarRef: null, primaryPublicHandle: null, communityBinding: { communityId, bindingSource: "first_membership" } }] }),
      prepare, refresh, csrf: input.csrf ?? (() => "csrf"), grantClient, claimClient: api, claimPolling: { maxPolls: 0 } });
  });
  await vi.waitFor(() => expect(controller.offering() !== undefined || controller.available()).toBe(true));
  return { controller, api, grantClient, prepare, refresh, setAccount };
}

describe("connected community name ownership and recovery", () => {
  it.each(["ar", "zh"] as const)("localizes recovery feedback without a Storybook provider: %s", async locale => {
    const previous = document.documentElement.lang; document.documentElement.lang = locale;
    const notify = vi.spyOn(toast, "error").mockImplementation(() => 12345);
    try {
      const { controller, api } = await setup();
      api.post_handleClaims = vi.fn(async () => { throw new ApiClientError({ code: "conflict", name: "Conflict", status: 409, retryable: false },
        { error: { code: "conflict", message: "expired", retryable: false, details: { reason: "reservation_expired" } } }); });
      await controller.show(); controller.setLabel(label); await vi.waitFor(() => expect(controller.state().label).toBe(label)); await controller.submit();
      expect(notify).toHaveBeenCalledWith(getLocaleMessages(locale, "routes").communityJoinName.requestExpired);
    } finally { notify.mockRestore(); document.documentElement.lang = previous; }
  });
  it("recovers a submitted claim after its offer is withdrawn without CSRF or repeated writes", async () => {
    const first = await setup(); await first.controller.show(); first.controller.setLabel(label); await vi.waitFor(() => expect(first.controller.state().label).toBe(label)); await first.controller.submit();
    for (const dispose of disposers.splice(0)) dispose();
    const second = await setup({ publicClient: { get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }, csrf: () => undefined });
    expect(second.controller.available()).toBe(true); expect(second.controller.open()).toBe(false);
    await second.controller.show(); await second.controller.resume();
    expect(second.controller.state()).toMatchObject({ kind: "issued", identifier: `${label}.charizard` });
    for (const method of [second.api.post_handlePersonaLinkConfirmations, second.api.post_handleQuotes, second.api.post_handleReservations, second.api.post_handleClaims]) expect(method).not.toHaveBeenCalled();
    expect(second.api.get_handleClaimsClaimId).toHaveBeenCalledWith(expect.anything(), { credentials: "same-origin", signal: expect.any(AbortSignal) });
  });
  it("requires a new explicit Get name after an unreserved offer changes", async () => {
    const first = await setup(); first.api.post_handleQuotes = vi.fn(async () => { throw new TypeError("response_lost"); });
    await first.controller.show(); first.controller.setLabel(label); await vi.waitFor(() => expect(first.controller.state().label).toBe(label)); await first.controller.submit();
    for (const dispose of disposers.splice(0)) dispose();
    const second = await setup({ publicClient: { get_communitiesCommunityIdHandleOfferings: async () => ({ items: [{ ...offering, offering_revision: 2, offering_hash: "new-hash" }], next_cursor: null }) } });
    await second.controller.show(); await second.controller.resume();
    expect(second.controller.state()).toMatchObject({ kind: "editing", label });
    expect(readCommunityNameAttempt(sessionStorage, "account", communityId)).toBeUndefined();
    expect(second.api.post_handlePersonaLinkConfirmations).not.toHaveBeenCalled(); expect(second.api.post_handleClaims).not.toHaveBeenCalled();
  });
  it("offers a fresh explicit submission after the server proves a reservation expired", async () => {
    const { controller, api } = await setup();
    api.post_handleClaims = vi.fn(async () => { throw new ApiClientError({ code: "conflict", name: "Conflict", status: 409, retryable: false },
      { error: { code: "conflict", message: "expired", retryable: false, details: { reason: "reservation_expired" } } }); });
    await controller.show(); controller.setLabel(label); await vi.waitFor(() => expect(controller.state().label).toBe(label)); await controller.submit();
    expect(controller.state()).toMatchObject({ kind: "editing", label });
    expect(readCommunityNameAttempt(sessionStorage, "account", communityId)).toBeUndefined();
    expect(api.post_handleClaims).toHaveBeenCalledOnce(); expect(api.post_handlePersonaLinkConfirmations).toHaveBeenCalledOnce();
  });
  it("keeps a reservation-bound refusal recoverable before offering a different name", async () => {
    const { controller, api } = await setup();
    api.post_handleClaims = vi.fn(async () => { throw new ApiClientError({ code: "conflict", name: "Conflict", status: 409, retryable: false },
      { error: { code: "conflict", message: "unavailable", retryable: false, details: { reason: "handle_unavailable" } } }); });
    await controller.show(); controller.setLabel(label); await vi.waitFor(() => expect(controller.state().label).toBe(label)); await controller.submit();
    expect(controller.state()).toMatchObject({ kind: "pending", label, unconfirmed: true });
    const saved = readCommunityNameAttempt(sessionStorage, "account", communityId)!;
    expect(saved.reservation).toBeDefined();
    controller.setLabel("different-name"); expect(controller.state().label).toBe(label);
  });
  it("reads offerings without opening or confirming a name, then keeps closed membership independent", async () => {
    const { controller, api, prepare } = await setup();
    expect(controller.open()).toBe(false); expect(api.post_handlePersonaLinkConfirmations).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
    await controller.show(); expect(controller.open()).toBe(true);
    controller.setLabel(""); await controller.submit(); controller.setLabel("short"); await controller.submit();
    expect(api.post_handlePersonaLinkConfirmations).not.toHaveBeenCalled();
    controller.setOpen(false); await vi.waitFor(() => expect(controller.open()).toBe(false)); expect(controller.available()).toBe(true);
    await controller.show(); expect(controller.open()).toBe(true);
  });
  it("retains pending issuance through reload and reopens the same claim with no repeated writes", async () => {
    const first = await setup(); await first.controller.show(); first.controller.setLabel(label); await vi.waitFor(() => expect(first.controller.state().label).toBe(label)); await first.controller.submit();
    expect(first.controller.state()).toMatchObject({ kind: "pending", claimId: "claim-1", label });
    expect(first.controller.available()).toBe(true);
    for (const dispose of disposers.splice(0)) dispose();
    const second = await setup(); expect(second.controller.open()).toBe(false);
    await second.controller.show(); expect(second.controller.state()).toMatchObject({ kind: "pending", claimId: "claim-1" });
    await second.controller.resume(); expect(second.controller.state()).toMatchObject({ kind: "issued", identifier: `${label}.charizard` });
    for (const method of [second.api.post_handlePersonaLinkConfirmations, second.api.post_handleQuotes, second.api.post_handleReservations, second.api.post_handleClaims]) expect(method).not.toHaveBeenCalled();
    expect(second.refresh).toHaveBeenCalledOnce();
  });
  it("reads an existing active name on a cold revisit without claiming again", async () => {
    const { controller, api, prepare } = await setup({ grants: [publicGrant()] });
    await controller.show(); expect(controller.state()).toMatchObject({ kind: "issued", identifier: `${label}.charizard` });
    expect(api.post_handlePersonaLinkConfirmations).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
  });
  it("does not publish an issued link while the grant's host is unavailable", async () => {
    const blockedHost = { ...publicGrant(), host: { kind: "unavailable" as const, reason: "dns_or_gateway_unhealthy" as const } };
    const { controller, api } = await setup({ host: blockedHost });
    api.post_handleClaims = vi.fn(async () => ({ claim: claim(), replayed: false }));
    await controller.show(); controller.setLabel(label); await vi.waitFor(() => expect(controller.state().label).toBe(label)); await controller.submit();
    expect(controller.state().kind).toBe("pending"); expect(controller.state().kind).not.toBe("issued"); expect(controller.available()).toBe(true);
  });
  it("keeps an uncertain claim locked to its label and exact attempt keys", async () => {
    const { controller, api } = await setup();
    api.post_handleClaims = vi.fn(async () => { throw new TypeError("response_lost"); });
    await controller.show(); controller.setLabel(label); await vi.waitFor(() => expect(controller.state().label).toBe(label)); await controller.submit();
    expect(controller.state().kind).toBe("pending");
    const saved = readCommunityNameAttempt(sessionStorage, "account", communityId)!;
    controller.setLabel("different-name"); expect(controller.state().label).toBe(label);
    api.post_handleClaims = vi.fn(async () => ({ claim: claim("issuance_pending"), replayed: false }));
    await controller.resume();
    expect(api.post_handleClaims).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ idempotency_key: saved.keys.claim }) }), expect.objectContaining({ credentials: "same-origin" }));
    expect(api.post_handlePersonaLinkConfirmations).toHaveBeenCalledTimes(1);
  });
  it("keeps membership and provides correction after a taken-name race", async () => {
    const { controller, api } = await setup();
    api.post_handleReservations = vi.fn(async () => { throw new ApiClientError({ code: "conflict", name: "Conflict", status: 409, retryable: false }, { error: { code: "conflict", message: "unavailable", retryable: false, details: { reason: "handle_unavailable" } } }); });
    await controller.show(); controller.setLabel(label); await vi.waitFor(() => expect(controller.state().label).toBe(label)); await controller.submit();
    expect(controller.state()).toMatchObject({ kind: "editing", issue: "taken" });
    expect(controller.available()).toBe(true); expect(readCommunityNameAttempt(sessionStorage, "account", communityId)).toBeUndefined();
    controller.setLabel("different-name"); await vi.waitFor(() => expect(controller.state().label).toBe("different-name")); expect(controller.state()).toEqual({ kind: "editing", label: "different-name" });
  });
  it("closes on account changes, retires late results, and preserves the original account's continuation", async () => {
    const { controller, api, setAccount } = await setup();
    let finish!: (value: GetHandleClaimsClaimIdResponse) => void;
    api.post_handleClaims = vi.fn(async () => ({ claim: await new Promise<GetHandleClaimsClaimIdResponse>(resolve => { finish = resolve; }), replayed: false }));
    await controller.show(); controller.setLabel(label); await vi.waitFor(() => expect(controller.state().label).toBe(label)); const submitting = controller.submit();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    setAccount("other-account"); await vi.waitFor(() => expect(controller.open()).toBe(false));
    finish(claim()); await submitting;
    expect(controller.state()).toEqual({ kind: "editing", label: "" });
    expect(readCommunityNameAttempt(sessionStorage, "other-account", communityId)).toBeUndefined();
    expect(readCommunityNameAttempt(sessionStorage, "account", communityId)?.keys.claim).toBeDefined();
  });
});
