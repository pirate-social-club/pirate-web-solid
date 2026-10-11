import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, type GetPersonasPersonaIdHandleGrantsResponse, type GetHandleClaimsClaimIdResponse } from "@pirate/api-client";
import { createCommunityNameController, type CommunityNameControllerOptions } from "./community-name-controller.ts";
import { communityNameStorageKey, createCommunityNameAttempt, readCommunityNameAttempt, saveCommunityNameAttempt } from "./community-name-acquisition.ts";
import { communityId, offering, personaId, label, confirmation, quote, reservation, claim } from "./community-name-test-fixtures.ts";
import type { PublicHandleGrantApiClient, SessionHandleSalesApiClient } from "../../../api/handle-sales-client.ts";
import { toast } from "../../../design-system.ts";
import { getLocaleMessages } from "../../../locales/index.ts";

const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); localStorage.clear(); sessionStorage.clear(); });
const publicGrant = (): Extract<GetPersonasPersonaIdHandleGrantsResponse["items"][number], { handle: { family: "hns" } }> => ({ grant_id: "grant-1", grant_generation: 1, community_id: communityId,
  owner_persona: { persona_id: personaId, object: "persona", display_name: null, avatar_ref: null, primary_public_handle: `${label}.charizard` },
  sale_namespace_activation_id: offering.sale_namespace_activation_id, sale_namespace_activation_generation: 3, fulfillment: { kind: "hosted_persona_v1" },
  handle: { family: "hns", namespace_root: "charizard", handle_label: label }, display_identifier: `${label}.charizard`,
  host: { kind: "available", normalized_host: `${label}.charizard`, sale_namespace_activation_generation: 3, grant_generation: 1 }, issued_at: "2026-08-26T12:00:01Z" });

async function setup(input: { api?: SessionHandleSalesApiClient; grantClient?: PublicHandleGrantApiClient; grants?: GetPersonasPersonaIdHandleGrantsResponse["items"]; host?: GetPersonasPersonaIdHandleGrantsResponse["items"][number]; publicClient?: CommunityNameControllerOptions["publicClient"]; csrf?: CommunityNameControllerOptions["csrf"] } = {}) {
  const api: SessionHandleSalesApiClient = input.api ?? { get_personas: vi.fn(async () => ({ personas: [] })), get_handleClaimsClaimId: vi.fn(async () => claim()),
    post_handlePersonaLinkConfirmations: vi.fn(async () => confirmation), post_handleQuotes: vi.fn(async () => quote), post_handleReservations: vi.fn(async () => reservation), post_handleClaims: vi.fn(async () => ({ claim: claim("issuance_pending"), replayed: false })) };
  const grantClient: PublicHandleGrantApiClient = input.grantClient ?? { get_personasPersonaIdHandleGrants: vi.fn(async () => ({ items: input.grants ?? [], next_cursor: null })),
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
  it("keeps the same owner's entry visible while opening rechecks the offering", async () => {
    const { controller, grantClient } = await setup({ publicClient: {
      get_communitiesCommunityIdHandleOfferings: async () => ({ items: [{ ...offering }], next_cursor: null }),
    } });
    await vi.waitFor(() => expect(controller.entry()).toBe("new"));
    const finishes: Array<(value: GetPersonasPersonaIdHandleGrantsResponse) => void> = [];
    grantClient.get_personasPersonaIdHandleGrants = vi.fn(async () => new Promise<GetPersonasPersonaIdHandleGrantsResponse>(resolve => { finishes.push(resolve); }));
    const opening = controller.show();
    await vi.waitFor(() => expect(finishes.length).toBe(2));
    try { expect(controller.entry()).toBe("new"); }
    finally { for (const finish of finishes) finish({ items: [], next_cursor: null }); await opening; }
    expect(controller.open()).toBe(true);
  });
  it("offers a new name only after owned active-grant reads prove absence", async () => {
    const { controller, api, prepare } = await setup();
    await vi.waitFor(() => expect(controller.entry()).toBe("new"));
    expect(controller.open()).toBe(false); expect(prepare).not.toHaveBeenCalled();
    expect(api.post_handlePersonaLinkConfirmations).not.toHaveBeenCalled();
  });
  it.each(["unavailable", "changed_offering"] as const)("does not offer another name when an active grant has %s", async kind => {
    const grant = kind === "unavailable" ? { ...publicGrant(), host: { kind: "unavailable" as const, reason: "dns_or_gateway_unhealthy" as const } }
      : { ...publicGrant(), sale_namespace_activation_generation: 2 };
    const { controller, api, prepare, grantClient } = await setup({ grants: [grant] });
    await vi.waitFor(() => expect(controller.entry()).toBe("named"));
    expect(controller.open()).toBe(false); expect(prepare).not.toHaveBeenCalled();
    expect(grantClient.get_handlesFamilyNamespaceRootHandleLabel).not.toHaveBeenCalled();
    expect(api.post_handleClaims).not.toHaveBeenCalled();
  });
  it("reopens a saved interrupted attempt once per return and suppresses new-name entry after issuance", async () => {
    const first = await setup(); await first.controller.show(); first.controller.setLabel(label);
    await vi.waitFor(() => expect(first.controller.state().label).toBe(label)); await first.controller.submit();
    const saved = readCommunityNameAttempt(localStorage, "account", communityId)!;
    for (const dispose of disposers.splice(0)) dispose(); sessionStorage.clear();
    const second = await setup(); await vi.waitFor(() => expect(second.controller.entry()).toBe("pending"));
    await second.controller.restoreOnReturn(); expect(second.controller.open()).toBe(true);
    expect(second.controller.state()).toMatchObject({ kind: "pending", label, claimId: "claim-1" });
    second.controller.setOpen(false); await vi.waitFor(() => expect(second.controller.open()).toBe(false));
    await second.controller.restoreOnReturn(); expect(second.controller.open()).toBe(false);
    await second.controller.show(); await second.controller.resume();
    expect(second.controller.entry()).toBe("named");
    expect(readCommunityNameAttempt(localStorage, "account", communityId)?.keys).toEqual(saved.keys);
    for (const method of [second.api.post_handlePersonaLinkConfirmations, second.api.post_handleQuotes, second.api.post_handleReservations, second.api.post_handleClaims]) expect(method).not.toHaveBeenCalled();
  });
  it("recovers an interrupted claim even when its active grant already exists", async () => {
    const first = await setup();
    first.api.post_handleClaims = vi.fn(async () => { throw new TypeError("response_lost"); });
    await first.controller.show(); first.controller.setLabel(label);
    await vi.waitFor(() => expect(first.controller.state().label).toBe(label)); await first.controller.submit();
    const saved = readCommunityNameAttempt(localStorage, "account", communityId)!;
    for (const dispose of disposers.splice(0)) dispose(); sessionStorage.clear();
    const second = await setup({ grants: [publicGrant()] });
    await vi.waitFor(() => expect(second.controller.entry()).toBe("pending"));
    await second.controller.restoreOnReturn();
    expect(second.controller.state()).toMatchObject({ kind: "pending", label, unconfirmed: true });
    second.api.post_handleClaims = vi.fn(async () => ({ claim: claim(), replayed: true }));
    await second.controller.resume();
    expect(second.controller.state()).toMatchObject({ kind: "issued", identifier: `${label}.charizard` });
    expect(second.controller.entry()).toBe("named");
    expect(second.api.post_handleClaims).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ idempotency_key: saved.keys.claim }) }), expect.anything());
    for (const method of [second.api.post_handlePersonaLinkConfirmations, second.api.post_handleQuotes, second.api.post_handleReservations]) expect(method).not.toHaveBeenCalled();
  });
  it.each(["unavailable", "wrong_grant", "wrong_generation"] as const)("keeps an issued attempt recoverable when its host is %s", async kind => {
    const blockedHost = kind === "unavailable"
      ? { ...publicGrant(), host: { kind: "unavailable" as const, reason: "dns_or_gateway_unhealthy" as const } }
      : kind === "wrong_grant" ? { ...publicGrant(), grant_id: "another-grant" }
      : { ...publicGrant(), grant_generation: 2 };
    const saved = { ...createCommunityNameAttempt({ accountId: "account", communityId, personaId, offering, label }),
      confirmation, quote, reservation, claim: { claim: claim(), replayed: false } };
    saveCommunityNameAttempt(localStorage, saved);
    const currentOffer = { ...offering, offering_revision: 2, offering_hash: "new-hash", sale_namespace_activation_generation: 4 };
    const second = await setup({ grants: [{ ...publicGrant(), grant_id: "another-grant" }], host: blockedHost,
      publicClient: { get_communitiesCommunityIdHandleOfferings: async () => ({ items: [currentOffer], next_cursor: null }) } });
    await vi.waitFor(() => expect(second.controller.entry()).toBe("pending"));
    await second.controller.restoreOnReturn();
    expect(second.controller.state()).toMatchObject({ kind: "pending", label, claimId: "claim-1" });
    await second.controller.resume();
    expect(second.controller.entry()).toBe("pending");
    expect(second.controller.state().kind).toBe("pending");
    second.grantClient.get_handlesFamilyNamespaceRootHandleLabel = vi.fn(async () => publicGrant());
    await second.controller.resume();
    expect(second.controller.entry()).toBe("named");
    expect(second.controller.state()).toMatchObject({ kind: "issued", identifier: `${label}.charizard` });
    expect(readCommunityNameAttempt(localStorage, "account", communityId)?.keys).toEqual(saved.keys);
    for (const method of [second.api.post_handlePersonaLinkConfirmations, second.api.post_handleQuotes, second.api.post_handleReservations, second.api.post_handleClaims]) expect(method).not.toHaveBeenCalled();
    for (const dispose of disposers.splice(0)) dispose();
    const verified = await setup({ grants: [publicGrant()],
      publicClient: { get_communitiesCommunityIdHandleOfferings: async () => ({ items: [currentOffer], next_cursor: null }) } });
    await vi.waitFor(() => expect(verified.controller.entry()).toBe("named"));
    await verified.controller.restoreOnReturn(); expect(verified.controller.open()).toBe(false);
    expect(verified.grantClient.get_handlesFamilyNamespaceRootHandleLabel).toHaveBeenCalled();
    for (const method of [verified.api.post_handlePersonaLinkConfirmations, verified.api.post_handleQuotes, verified.api.post_handleReservations, verified.api.post_handleClaims]) expect(method).not.toHaveBeenCalled();
  });
  it("recovers intent saved by another tab while the active-grant read is pending", async () => {
    let finish!: (value: GetPersonasPersonaIdHandleGrantsResponse) => void;
    const { controller, api } = await setup({ grantClient: {
      get_personasPersonaIdHandleGrants: vi.fn(async () => new Promise<GetPersonasPersonaIdHandleGrantsResponse>(resolve => { finish = resolve; })),
      get_handlesFamilyNamespaceRootHandleLabel: vi.fn(async () => publicGrant()),
    } });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    const saved = createCommunityNameAttempt({ accountId: "account", communityId, personaId, offering, label });
    saveCommunityNameAttempt(localStorage, saved);
    finish({ items: [publicGrant()], next_cursor: null });
    await vi.waitFor(() => expect(controller.entry()).toBe("pending"));
    await controller.restoreOnReturn();
    expect(controller.state()).toMatchObject({ kind: "pending", label, unconfirmed: true });
    expect(readCommunityNameAttempt(localStorage, "account", communityId)?.keys).toEqual(saved.keys);
    for (const method of [api.post_handlePersonaLinkConfirmations, api.post_handleQuotes, api.post_handleReservations, api.post_handleClaims]) expect(method).not.toHaveBeenCalled();
  });
  it("retains another tab's original intent discovered during profile preparation", async () => {
    const { controller, api, prepare } = await setup();
    const retained = createCommunityNameAttempt({ accountId: "account", communityId, personaId, offering, label: "another-name" });
    prepare.mockImplementationOnce(async () => {
      saveCommunityNameAttempt(localStorage, retained);
      return { personaId, displayName: null, avatarRef: null, primaryPublicHandle: null, communityBinding: { communityId, bindingSource: "first_membership" } };
    });
    await controller.show(); controller.setLabel(label);
    await vi.waitFor(() => expect(controller.state().label).toBe(label)); await controller.submit();
    expect(controller.state()).toMatchObject({ kind: "pending", label: retained.label });
    expect(controller.entry()).toBe("pending");
    expect(controller.available()).toBe(true);
    expect(readCommunityNameAttempt(localStorage, "account", communityId)).toEqual(retained);
    for (const method of [api.post_handlePersonaLinkConfirmations, api.post_handleQuotes, api.post_handleReservations, api.post_handleClaims]) expect(method).not.toHaveBeenCalled();
  });
  it("fails before commands when persistent recovery cannot be saved", async () => {
    const { controller, api } = await setup();
    await controller.show(); controller.setLabel(label);
    await vi.waitFor(() => expect(controller.state().label).toBe(label));
    const unavailable = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Storage unavailable", "QuotaExceededError"); });
    try {
      await controller.submit();
      expect(controller.state().kind).toBe("failed");
      for (const method of [api.post_handlePersonaLinkConfirmations, api.post_handleQuotes, api.post_handleReservations, api.post_handleClaims]) expect(method).not.toHaveBeenCalled();
    } finally { unavailable.mockRestore(); }
  });
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
    expect(readCommunityNameAttempt(localStorage, "account", communityId)).toBeUndefined();
    expect(second.api.post_handlePersonaLinkConfirmations).not.toHaveBeenCalled(); expect(second.api.post_handleClaims).not.toHaveBeenCalled();
  });
  it("offers a fresh explicit submission after the server proves a reservation expired", async () => {
    const { controller, api } = await setup();
    api.post_handleClaims = vi.fn(async () => { throw new ApiClientError({ code: "conflict", name: "Conflict", status: 409, retryable: false },
      { error: { code: "conflict", message: "expired", retryable: false, details: { reason: "reservation_expired" } } }); });
    await controller.show(); controller.setLabel(label); await vi.waitFor(() => expect(controller.state().label).toBe(label)); await controller.submit();
    expect(controller.state()).toMatchObject({ kind: "editing", label });
    expect(readCommunityNameAttempt(localStorage, "account", communityId)).toBeUndefined();
    expect(api.post_handleClaims).toHaveBeenCalledOnce(); expect(api.post_handlePersonaLinkConfirmations).toHaveBeenCalledOnce();
  });
  it("keeps a reservation-bound refusal recoverable before offering a different name", async () => {
    const { controller, api } = await setup();
    api.post_handleClaims = vi.fn(async () => { throw new ApiClientError({ code: "conflict", name: "Conflict", status: 409, retryable: false },
      { error: { code: "conflict", message: "unavailable", retryable: false, details: { reason: "handle_unavailable" } } }); });
    await controller.show(); controller.setLabel(label); await vi.waitFor(() => expect(controller.state().label).toBe(label)); await controller.submit();
    expect(controller.state()).toMatchObject({ kind: "pending", label, unconfirmed: true });
    const saved = readCommunityNameAttempt(localStorage, "account", communityId)!;
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
  it("retains pending issuance after tab closure and reopens the same claim with no repeated writes", async () => {
    const first = await setup(); await first.controller.show(); first.controller.setLabel(label); await vi.waitFor(() => expect(first.controller.state().label).toBe(label)); await first.controller.submit();
    expect(first.controller.state()).toMatchObject({ kind: "pending", claimId: "claim-1", label });
    expect(first.controller.available()).toBe(true);
    sessionStorage.clear();
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
  it("replays a lost claim response after tab closure using the original command key", async () => {
    const first = await setup();
    first.api.post_handleClaims = vi.fn(async () => { throw new TypeError("response_lost"); });
    await first.controller.show(); first.controller.setLabel(label);
    await vi.waitFor(() => expect(first.controller.state().label).toBe(label)); await first.controller.submit();
    const retained = readCommunityNameAttempt(localStorage, "account", communityId)!;
    expect(retained.claim).toBeUndefined(); expect(retained.reservation).toBeDefined();
    sessionStorage.clear();
    for (const dispose of disposers.splice(0)) dispose();
    const second = await setup(); await second.controller.show();
    expect(second.controller.state()).toMatchObject({ kind: "pending", label, unconfirmed: true });
    second.controller.setLabel("different-name"); expect(second.controller.state().label).toBe(label);
    await second.controller.resume();
    expect(second.api.post_handleClaims).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ idempotency_key: retained.keys.claim }) }), expect.anything());
    for (const method of [second.api.post_handlePersonaLinkConfirmations, second.api.post_handleQuotes, second.api.post_handleReservations]) expect(method).not.toHaveBeenCalled();
  });
  it("migrates an old tab's pending command before that tab is closed", async () => {
    const first = await setup(); await first.controller.show(); first.controller.setLabel(label);
    await vi.waitFor(() => expect(first.controller.state().label).toBe(label)); await first.controller.submit();
    const key = communityNameStorageKey("account", communityId);
    sessionStorage.setItem(key, localStorage.getItem(key)!); localStorage.removeItem(key);
    for (const dispose of disposers.splice(0)) dispose();
    const migrating = await setup(); await migrating.controller.show();
    expect(localStorage.getItem(key)).not.toBeNull(); expect(sessionStorage.getItem(key)).toBeNull();
    sessionStorage.clear();
    for (const dispose of disposers.splice(0)) dispose();
    const restarted = await setup(); await restarted.controller.show(); await restarted.controller.resume();
    expect(restarted.controller.state()).toMatchObject({ kind: "issued", identifier: `${label}.charizard` });
    expect(restarted.api.post_handleClaims).not.toHaveBeenCalled();
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
    const saved = readCommunityNameAttempt(localStorage, "account", communityId)!;
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
    expect(controller.available()).toBe(true); expect(readCommunityNameAttempt(localStorage, "account", communityId)).toBeUndefined();
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
    expect(readCommunityNameAttempt(localStorage, "other-account", communityId)).toBeUndefined();
    expect(readCommunityNameAttempt(localStorage, "account", communityId)?.keys.claim).toBeDefined();
  });
});
