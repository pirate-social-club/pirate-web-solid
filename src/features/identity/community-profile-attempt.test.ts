import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedSession, ActivePersonaPublicProjection } from "../../api/session.ts";
import { createCommunityProfileAttempt, type CommunityProfileLock } from "./community-profile-attempt.ts";
import { createCommunityProfilePreparation, type CommunityProfilePreparationInput } from "./community-profile-preparation.ts";

const profile = (personaId: string, communityId: string | null): ActivePersonaPublicProjection => ({ personaId, displayName: null, avatarRef: null, primaryPublicHandle: null,
  communityBinding: communityId === null ? null : { communityId, bindingSource: "first_membership" } });
const input = (personas: AuthenticatedSession["personas"] = [], userId = "account") => ({ session: { status: "authenticated" as const, userId, personas }, communityId: "community", signal: new AbortController().signal });
function serialLocks(): CommunityProfileLock {
  let previous = Promise.resolve();
  return { async request(_name, signal, callback) {
    const prior = previous;
    let release!: () => void;
    previous = new Promise<void>(resolve => { release = resolve; });
    await prior;
    try { signal.throwIfAborted(); return await callback(); } finally { release(); }
  } };
}
const attempt = (prepare: Parameters<typeof createCommunityProfileAttempt>[0]) => async (request: ReturnType<typeof input>) =>
  createCommunityProfileAttempt(prepare, { resolve: async () => request.session, refresh: vi.fn(), locks: serialLocks() })(request);
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

describe("durable community profile preparation intent", () => {
  it("replays the same identity choice and keys after an uncertain response and tab closure", async () => {
    const first = vi.fn(async (_request: CommunityProfilePreparationInput) => { throw new TypeError("response_lost"); });
    await expect(attempt(first)(input())).rejects.toThrow("response_lost");
    const original = first.mock.calls[0]![0];
    sessionStorage.clear();
    const second = vi.fn(async (_request: CommunityProfilePreparationInput) => profile("created", "community"));
    await attempt(second)(input([profile("new-unbound", null)]));
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ preparationKey: original.preparationKey, walletKey: original.walletKey, choice: { kind: "create_new" } }));
    expect(localStorage.length).toBe(0);
  });
  it("never sends a preparation command when saving its recovery keys fails", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage_unavailable"); });
    const prepare = vi.fn(async () => profile("created", "community"));
    await expect(attempt(prepare)(input())).rejects.toThrow("storage_unavailable");
    expect(prepare).not.toHaveBeenCalled();
  });
  it("preserves an existing active community profile even when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage_unavailable"); });
    const existing = profile("current", "community");
    const prepare = vi.fn(async () => existing);
    expect(await attempt(prepare)(input([existing]))).toBe(existing);
  });
  it("does not replay another account's uncertain preparation", async () => {
    const first = vi.fn(async (_request: CommunityProfilePreparationInput) => { throw new Error("response_lost"); });
    await expect(attempt(first)(input())).rejects.toThrow();
    const second = vi.fn(async (_request: CommunityProfilePreparationInput) => profile("other", "community"));
    await attempt(second)(input([], "other-account"));
    expect(second.mock.calls[0]![0].preparationKey).not.toBe(first.mock.calls[0]![0].preparationKey);
    expect(second.mock.calls[0]![0].accountId).toBe("other-account");
  });
  it("serializes two tabs and refreshes authority before the waiting tab can mint", async () => {
    const request = input();
    let session = request.session;
    const created = profile("created", "community");
    const mint = vi.fn(async () => {
      session = { ...session, personas: [created] };
      return { object: "activity_persona_preparation" as const, community_id: "community", persona_id: "created", persona_status: "active" as const, activity_presentation: null };
    });
    const resolve = async () => session;
    const prepare = createCommunityProfilePreparation({ api: { prepare: mint }, resolve, refresh: vi.fn() });
    const options = { resolve, refresh: vi.fn(), locks: serialLocks() };
    const firstTab = createCommunityProfileAttempt(prepare, options);
    const secondTab = createCommunityProfileAttempt(prepare, options);
    expect(await Promise.all([firstTab(request), secondTab(request)])).toEqual([created, created]);
    expect(mint).toHaveBeenCalledOnce();
  });
  it("refuses to mint when fresh unbound profiles require a choice", async () => {
    const prepare = vi.fn();
    await expect(attempt(prepare)(input([profile("a", null), profile("b", null)]))).rejects.toMatchObject({ reason: "profile_selection_required" });
    expect(prepare).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });
  it("does not continue an old account's preparation after account replacement", async () => {
    const prepare = vi.fn();
    const run = createCommunityProfileAttempt(prepare, { resolve: async () => input([], "different").session, refresh: vi.fn(), locks: serialLocks() });
    await expect(run(input())).rejects.toMatchObject({ reason: "identity_changed" });
    expect(prepare).not.toHaveBeenCalled();
  });
  it("does not silently substitute an uncertain choice for an explicit new selection", async () => {
    const prepare = vi.fn(async () => { throw new Error("response_lost"); });
    const request = input([profile("a", null), profile("b", null)]);
    const run = createCommunityProfileAttempt(prepare, { resolve: async () => request.session, refresh: vi.fn(), locks: serialLocks() });
    await expect(run({ ...request, choice: { kind: "existing", personaId: "a" } })).rejects.toThrow("response_lost");
    await expect(run({ ...request, choice: { kind: "existing", personaId: "b" } })).rejects.toThrow("profile_attempt_conflict");
    expect(prepare).toHaveBeenCalledOnce();
  });

  it.each(["explicit", "retained", "retained-active"])("keeps the chosen profile when another tab binds a different profile: %s", async mode => {
    const request = input([profile("chosen", null), profile("other", null)]);
    const originalChoice = { kind: "existing" as const, personaId: "chosen" };
    let fresh = request.session;
    const options = { resolve: async () => fresh, refresh: vi.fn(), locks: serialLocks() };
    let originalKey: string | undefined;
    if (mode !== "explicit") {
      const uncertain = vi.fn(async (prepared: CommunityProfilePreparationInput) => { originalKey = prepared.preparationKey; throw new Error("response_lost"); });
      await expect(createCommunityProfileAttempt(uncertain, options)({ ...request, choice: originalChoice })).rejects.toThrow("response_lost");
    }
    const chosen = profile("chosen", "community");
    fresh = { ...fresh, personas: [profile("other", "community"), mode === "retained-active" ? chosen : profile("chosen", null)] };
    const bind = vi.fn(async () => {
      fresh = { ...fresh, personas: [profile("other", "community"), chosen] };
      return { object: "activity_persona_preparation" as const, community_id: "community", persona_id: "chosen", persona_status: "active" as const, activity_presentation: null };
    });
    const prepare = createCommunityProfilePreparation({ api: { prepare: bind }, resolve: options.resolve, refresh: vi.fn() });
    const result = await createCommunityProfileAttempt(prepare, options)({ ...request, ...(mode === "explicit" ? { choice: originalChoice } : {}) });
    expect(result.personaId).toBe("chosen");
    if (mode === "retained-active") expect(bind).not.toHaveBeenCalled();
    else {
      expect(bind).toHaveBeenCalledWith(expect.objectContaining({ choice: originalChoice }));
      if (originalKey !== undefined) expect(bind).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: originalKey }));
    }
    expect(localStorage.length).toBe(0);
  });

});
