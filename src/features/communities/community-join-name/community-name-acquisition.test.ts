import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionHandleSalesApiClient } from "../../../api/handle-sales-client.ts";
import type { GetHandleClaimsClaimIdResponse } from "@pirate/api-client";
import { communityId, offering, personaId, label, confirmation, quote, reservation, claim } from "./community-name-test-fixtures.ts";
import { createCommunityNameAttempt, runCommunityNameAcquisition, readCommunityNameAttempt, saveCommunityNameAttempt } from "./community-name-acquisition.ts";

const client = (): SessionHandleSalesApiClient => ({ post_handlePersonaLinkConfirmations: vi.fn(async () => confirmation), post_handleQuotes: vi.fn(async () => quote),
  post_handleReservations: vi.fn(async () => reservation), post_handleClaims: vi.fn(async () => ({ claim: claim("issuance_pending"), replayed: false })),
  get_handleClaimsClaimId: vi.fn(async () => claim("issued")), get_personas: vi.fn(async () => ({ personas: [] })) });
const attempt = () => createCommunityNameAttempt({ accountId: "account", communityId, offering, personaId, label });
const requestOptions = { credentials: "same-origin" as const, headers: { "x-csrf-token": "csrf" } };
afterEach(() => sessionStorage.clear());

describe("durable community name acquisition", () => {
  it("saves the exact consent intent before a write and preserves a pending claim across reload", async () => {
    const api = client(); const original = attempt();
    const result = await runCommunityNameAcquisition({ client: api, attempt: original, requestOptions, maxPolls: 0, save: value => saveCommunityNameAttempt(sessionStorage, value) });
    expect(result.kind).toBe("pending");
    const saved = readCommunityNameAttempt(sessionStorage, "account", communityId)!;
    expect(saved.keys).toEqual(original.keys); expect(saved.claim?.claim.claim_id).toBe("claim-1");
    expect(api.post_handlePersonaLinkConfirmations).toHaveBeenCalledWith({ body: { idempotency_key: original.keys.confirmation, persona_id: personaId, offering_id: offering.offering_id, confirmed: true } }, requestOptions);
    const next = client();
    const recovered = await runCommunityNameAcquisition({ client: next, attempt: saved, requestOptions, save: value => saveCommunityNameAttempt(sessionStorage, value) });
    expect(recovered.kind).toBe("issued"); expect(next.get_handleClaimsClaimId).toHaveBeenCalledWith({ path: { claimId: "claim-1" } }, expect.objectContaining({ credentials: "same-origin" }));
    for (const method of [next.post_handlePersonaLinkConfirmations, next.post_handleQuotes, next.post_handleReservations, next.post_handleClaims]) expect(method).not.toHaveBeenCalled();
  });
  it("reuses the same claim key after an uncertain claim response without repeating earlier writes", async () => {
    const api = client(); const original = attempt();
    api.post_handleClaims = vi.fn(async () => { throw new TypeError("response_lost"); });
    await expect(runCommunityNameAcquisition({ client: api, attempt: original, requestOptions, save: value => saveCommunityNameAttempt(sessionStorage, value) })).rejects.toThrow("response_lost");
    const saved = readCommunityNameAttempt(sessionStorage, "account", communityId)!;
    expect(saved.reservation?.reservation.reservation_id).toBe("reservation-1"); expect(saved.claim).toBeUndefined();
    const next = client();
    await runCommunityNameAcquisition({ client: next, attempt: saved, requestOptions, maxPolls: 0, save: value => saveCommunityNameAttempt(sessionStorage, value) });
    expect(next.post_handleClaims).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ idempotency_key: original.keys.claim }) }), requestOptions);
    expect(next.post_handleQuotes).not.toHaveBeenCalled(); expect(next.post_handleReservations).not.toHaveBeenCalled(); expect(next.post_handlePersonaLinkConfirmations).not.toHaveBeenCalled();
  });
  it("rejects storage failure before sending consent", async () => {
    const api = client();
    await expect(runCommunityNameAcquisition({ client: api, attempt: attempt(), requestOptions, save: () => { throw new Error("storage_unavailable"); } })).rejects.toThrow("storage_unavailable");
    expect(api.post_handlePersonaLinkConfirmations).not.toHaveBeenCalled();
  });
  it("keeps another account's recovery inaccessible", () => {
    saveCommunityNameAttempt(sessionStorage, attempt());
    expect(readCommunityNameAttempt(sessionStorage, "another-account", communityId)).toBeUndefined();
  });
  it.each(["owner", "namespace", "grant"])("rejects mismatched recovered issuance authority: %s", async substitution => {
    const api = client();
    await runCommunityNameAcquisition({ client: api, attempt: attempt(), requestOptions, maxPolls: 0, save: value => saveCommunityNameAttempt(sessionStorage, value) });
    const next = client(); const issued = claim("issued");
    next.get_handleClaimsClaimId = vi.fn(async (): Promise<GetHandleClaimsClaimIdResponse> => ({ ...issued,
      ...(substitution === "owner" ? { owner_persona_id: "foreign" } : {}),
      ...(substitution === "namespace" ? { handle: { ...issued.handle, namespace_root: "elsewhere" } } : {}),
      ...(substitution === "grant" && issued.grant !== null ? { grant: { ...issued.grant, community_id: "foreign" } } : {}),
    }));
    await expect(runCommunityNameAcquisition({ client: next, attempt: readCommunityNameAttempt(sessionStorage, "account", communityId)!, requestOptions, save: vi.fn() })).rejects.toThrow("did not match");
  });
  it("stops before another command when the account's request is cancelled", async () => {
    const controller = new AbortController(); const api = client();
    api.post_handleQuotes = vi.fn(async () => { controller.abort(); return quote; });
    await expect(runCommunityNameAcquisition({ client: api, attempt: attempt(), requestOptions: { ...requestOptions, signal: controller.signal }, save: vi.fn() })).rejects.toMatchObject({ name: "AbortError" });
    expect(api.post_handleReservations).not.toHaveBeenCalled();
  });
});
