import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedSession, ActivePersonaPublicProjection } from "../../api/session.ts";
import { createCommunityProfilePreparation } from "./community-profile-preparation.ts";

const profile = (personaId: string, communityId: string | null): ActivePersonaPublicProjection => ({ personaId, avatarRef: null, displayName: "Profile", primaryPublicHandle: null,
  communityBinding: communityId === null ? null : { communityId, bindingSource: "first_membership" } });
const session = (personas: AuthenticatedSession["personas"], userId = "account"): AuthenticatedSession => ({ status: "authenticated", userId, personas });
const input = (personas: AuthenticatedSession["personas"]) => ({ accountId: "account", communityId: "community", session: session(personas), preparationKey: "prepare-key", walletKey: "wallet-key", signal: new AbortController().signal });
const prepared = (personaId = "created", status: "pending_wallet" | "active" = "pending_wallet") => ({ object: "activity_persona_preparation" as const, community_id: "community", persona_id: personaId, persona_status: status, activity_presentation: null });

describe("community profile preparation", () => {
  it("preserves the sole existing community profile and its public activity without minting or consent", async () => {
    const existing = { ...profile("current", "community"), primaryPublicHandle: "older-name.root" };
    const prepare = vi.fn();
    const activateWallet = vi.fn();
    const result = await createCommunityProfilePreparation({ api: { prepare }, activateWallet })(input([profile("foreign", "elsewhere"), existing]));
    expect(result).toBe(existing);
    expect(prepare).not.toHaveBeenCalled(); expect(activateWallet).not.toHaveBeenCalled();
  });
  it.each([{ personas: [] }, { personas: [profile("foreign", "elsewhere")] }])("prepares and activates a new exact-community profile before returning authority", async ({ personas }) => {
    const prepare = vi.fn(async () => prepared());
    const activateWallet = vi.fn(async () => true);
    const clearCache = vi.fn();
    const resolve = vi.fn(async () => session([profile("created", "community")]));
    const result = await createCommunityProfilePreparation({ api: { prepare }, activateWallet, clearCache, resolve })(input(personas));
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ choice: { kind: "create_new" }, communityId: "community", idempotencyKey: "prepare-key" }));
    expect(activateWallet).toHaveBeenCalledWith("account", "created", "wallet-key", expect.any(AbortSignal));
    expect(result.personaId).toBe("created"); expect(clearCache).toHaveBeenCalledOnce();
  });
  it("binds the first-time unbound profile without replacing it", async () => {
    const prepare = vi.fn(async () => prepared("unbound", "active"));
    const activateWallet = vi.fn();
    await createCommunityProfilePreparation({ api: { prepare }, activateWallet, clearCache: vi.fn(), resolve: async () => session([profile("unbound", "community")]) })(input([profile("unbound", null)]));
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ choice: { kind: "existing", personaId: "unbound" } })); expect(activateWallet).not.toHaveBeenCalled();
  });
  it("requires the existing profile selection when multiple eligible profiles exist", async () => {
    const prepare = vi.fn();
    const run = createCommunityProfilePreparation({ api: { prepare } });
    const request = input([profile("first", "community"), profile("current", "community")]);
    await expect(run(request)).rejects.toMatchObject({ reason: "profile_selection_required" });
    expect((await run({ ...request, preferredPersonaId: "current" })).personaId).toBe("current"); expect(prepare).not.toHaveBeenCalled();
  });
  it.each(["another-account", "inactive-profile"])("does not treat pending preparation or changed identity as active: %s", async failure => {
    const run = createCommunityProfilePreparation({ api: { prepare: async () => prepared() }, activateWallet: async () => true, clearCache: vi.fn(),
      resolve: async () => session([], failure === "another-account" ? "other" : "account") });
    await expect(run(input([]))).rejects.toMatchObject({ reason: failure === "another-account" ? "identity_changed" : "activation_required" });
  });
  it("resumes an existing pending wallet through the shared sign-in completion after reload", async () => {
    const signIn = vi.fn(async () => true);
    const run = createCommunityProfilePreparation({ api: { prepare: async () => prepared() }, activateWallet: async () => false, signIn, clearCache: vi.fn(), resolve: async () => session([profile("created", "community")]) });
    await run(input([])); expect(signIn).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it("does not advance after cancellation during activation", async () => {
    const controller = new AbortController();
    const resolve = vi.fn();
    const run = createCommunityProfilePreparation({ api: { prepare: async () => prepared() }, activateWallet: async () => { controller.abort(); return true; }, resolve });
    await expect(run({ ...input([]), signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" }); expect(resolve).not.toHaveBeenCalled();
  });
  it("requires an explicit choice between unbound profiles before creating anything", async () => {
    const prepare = vi.fn();
    await expect(createCommunityProfilePreparation({ api: { prepare } })(input([profile("a", null), profile("b", null)]))).rejects.toMatchObject({ reason: "profile_selection_required" });
    expect(prepare).not.toHaveBeenCalled();
  });

});
