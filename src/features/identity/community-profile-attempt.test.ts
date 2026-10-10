import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedSession, ActivePersonaPublicProjection } from "../../api/session.ts";
import { createCommunityProfileAttempt } from "./community-profile-attempt.ts";
import type { CommunityProfilePreparationInput } from "./community-profile-preparation.ts";

const profile = (personaId: string, communityId: string | null): ActivePersonaPublicProjection => ({ personaId, displayName: null, avatarRef: null, primaryPublicHandle: null,
  communityBinding: communityId === null ? null : { communityId, bindingSource: "first_membership" } });
const input = (personas: AuthenticatedSession["personas"] = [], userId = "account") => ({ session: { status: "authenticated" as const, userId, personas }, communityId: "community", signal: new AbortController().signal });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

describe("durable community profile preparation intent", () => {
  it("replays the same identity choice and keys after an uncertain response and tab closure", async () => {
    const first = vi.fn(async (_request: CommunityProfilePreparationInput) => { throw new TypeError("response_lost"); });
    await expect(createCommunityProfileAttempt(first)(input())).rejects.toThrow("response_lost");
    const original = first.mock.calls[0]![0];
    sessionStorage.clear();
    const second = vi.fn(async (_request: CommunityProfilePreparationInput) => profile("created", "community"));
    await createCommunityProfileAttempt(second)(input([profile("new-unbound", null)]));
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ preparationKey: original.preparationKey, walletKey: original.walletKey, choice: { kind: "create_new" } }));
    expect(localStorage.length).toBe(0);
  });
  it("never sends a preparation command when saving its recovery keys fails", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage_unavailable"); });
    const prepare = vi.fn(async () => profile("created", "community"));
    await expect(createCommunityProfileAttempt(prepare)(input())).rejects.toThrow("storage_unavailable");
    expect(prepare).not.toHaveBeenCalled();
  });
  it("preserves an existing active community profile even when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage_unavailable"); });
    const existing = profile("current", "community");
    const prepare = vi.fn(async () => existing);
    expect(await createCommunityProfileAttempt(prepare)(input([existing]))).toBe(existing);
  });
  it("does not replay another account's uncertain preparation", async () => {
    const first = vi.fn(async (_request: CommunityProfilePreparationInput) => { throw new Error("response_lost"); });
    await expect(createCommunityProfileAttempt(first)(input())).rejects.toThrow();
    const second = vi.fn(async (_request: CommunityProfilePreparationInput) => profile("other", "community"));
    await createCommunityProfileAttempt(second)(input([], "other-account"));
    expect(second.mock.calls[0]![0].preparationKey).not.toBe(first.mock.calls[0]![0].preparationKey);
    expect(second.mock.calls[0]![0].accountId).toBe("other-account");
  });
});
