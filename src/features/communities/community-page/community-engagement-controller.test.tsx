import { ApiClientError } from "@pirate/api-client";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AuthenticatedSession } from "../../../api/session.ts";
import type { CommunityEngagementApi } from "./community-engagement-api.ts";
import { createCommunityEngagementController } from "./community-engagement-controller.ts";

const disposers: Array<() => void> = [];
const unboundPersona = { personaId: "persona-a", displayName: "Persona A", avatarRef: null,
  primaryPublicHandle: null, communityBinding: null };
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); });

async function setup(overrides: Partial<CommunityEngagementApi> = {}, personas: AuthenticatedSession["personas"] = [], resolveSession = async (): Promise<AuthenticatedSession> => ({ status: "authenticated", userId: "account-a", personas })) {
  let committed = false;
  const api: CommunityEngagementApi = {
    readViewerState: vi.fn(async () => ({ membership: committed ? "member" as const : "not_member" as const, following: committed, followerCount: committed ? 7 : 0 })),
    resolveJoinAction: vi.fn(async () => ({ kind: "join" as const })),
    join: vi.fn(async () => { committed = true; return { status: "joined" as const, personaId: "persona-created" }; }),
    follow: vi.fn(async () => ({ following: true, followerCount: 1 })),
    unfollow: vi.fn(async () => ({ following: false, followerCount: 0 })),
    ...overrides,
  };
  const controller = createRoot(dispose => {
    disposers.push(dispose);
    return createCommunityEngagementController({
      api, communityId: "community-a", initialFollowerCount: 0, membershipMode: "open",
      navigate: vi.fn(), returnTo: "/c/community-a",
      resolveSession,
    });
  });
  await vi.waitFor(() => expect(controller.postingSession() !== undefined || controller.error().includes("active personas")).toBe(true));
  await vi.waitFor(() => expect(api.readViewerState).toHaveBeenCalled());
  return { api, controller };
}

describe("terminal community persona choice", () => {
  test("unavailable profiles block selection without claiming no eligible persona and allow retry", async () => {
    let unavailable = true;
    const { controller, api } = await setup({}, [], async () => ({ status: "authenticated", userId: "account-a",
      personas: unavailable ? [] : [unboundPersona], personasUnavailable: unavailable ? true as const : undefined }));
    await controller.joinCommunity();
    expect(controller.error()).toContain("couldn't load your active personas");
    expect(controller.postingSession()).toBeUndefined();
    expect(controller.joinPersonaStep()).toBe(false);
    expect(api.join).not.toHaveBeenCalled();
    unavailable = false;
    await controller.joinCommunity({ kind: "existing", personaId: "persona-a" });
    expect(api.join).toHaveBeenCalledOnce();
  });

  test("a successful follow clears the prior profile error", async () => {
    const { controller } = await setup({}, [], async () => ({ status: "authenticated", userId: "account-a", personas: [], personasUnavailable: true }));
    expect(controller.error()).toContain("active personas");
    await controller.followToggle();
    expect(controller.message()).toBe("Following this Community.");
    expect(controller.error()).toBe("");
  });

  test("explicit profile retry restores personas without following or joining", async () => {
    let unavailable = true;
    let rejectRetry = false;
    const { controller, api } = await setup({}, [], async () => {
      if (rejectRetry) throw new Error("network");
      return { status: "authenticated", userId: "account-a",
        personas: unavailable ? [] : [unboundPersona], personasUnavailable: unavailable ? true : undefined };
    });
    expect(controller.personaRetryAvailable()).toBe(true);
    rejectRetry = true;
    await controller.retryPersonas();
    expect(controller.error()).toContain("couldn't verify your session");
    rejectRetry = false;
    unavailable = false;
    await controller.retryPersonas();
    await vi.waitFor(() => expect(controller.postingSession()?.personas).toEqual([unboundPersona]));
    expect(controller.error()).toBe("");
    expect(api.join).not.toHaveBeenCalled();
    expect(api.follow).not.toHaveBeenCalled();
  });

  test("request-mode join sends no persona even when one is supplied", async () => {
    const { api, controller } = await setup({
      resolveJoinAction: vi.fn(async () => ({ kind: "request" as const })),
      join: vi.fn(async () => ({ status: "requested" as const, personaId: null })),
    });
    await controller.joinCommunity({ kind: "create_new" });
    expect(api.join).toHaveBeenCalledWith("community-a", undefined);
    expect(controller.joined()).toBe(false);
    expect(controller.message()).toBe("Membership request sent.");
  });

  test("terminal join sends the explicit choice and only then changes membership", async () => {
    const { api, controller } = await setup({}, [unboundPersona]);
    expect(controller.joined()).toBe(false);
    await controller.joinCommunity({ kind: "existing", personaId: "persona-a" });
    expect(api.join).toHaveBeenCalledWith("community-a", { kind: "existing", personaId: "persona-a" });
    expect(controller.joined()).toBe(true);
    expect(controller.following()).toBe(true);
    expect(controller.followerCount()).toBe(7);
  });

  test("a failed post-join preview preserves membership without manufacturing a count", async () => {
    const { api, controller } = await setup({}, [unboundPersona]);
    vi.mocked(api.readViewerState).mockRejectedValue(new Error("preview unavailable"));
    await controller.joinCommunity({ kind: "existing", personaId: "persona-a" });
    expect(controller.joined()).toBe(true);
    expect(controller.followerCount()).toBe(0);
    expect(controller.message()).toBe("Joined this Community.");
    expect(controller.error()).toContain("couldn't load");
  });

  test("zero-persona join cannot mint even through a stale confirmation", async () => {
    const { api, controller } = await setup();
    await controller.joinCommunity();
    expect(controller.joinPersonaStep()).toBe(true);
    expect(controller.joinPersonaChoice()).toBeUndefined();
    expect(api.join).not.toHaveBeenCalled();
    expect(controller.joined()).toBe(false);
    controller.confirmJoinPersona({ kind: "create_new" });
    await vi.waitFor(() => expect(controller.error()).toContain("coming soon"));
    expect(api.join).not.toHaveBeenCalled();
    expect(controller.joined()).toBe(false);
  });

  test("a binding conflict leaves membership unchanged and explains the next choice", async () => {
    const { controller } = await setup({
      join: vi.fn(async () => { throw new ApiClientError(
        { status: 409, code: "conflict", name: "Conflict", retryable: false },
        { error: { code: "conflict", message: "bound elsewhere", retryable: false } },
      ); }),
    }, [unboundPersona]);
    await controller.joinCommunity({ kind: "existing", personaId: "persona-a" });
    expect(controller.joined()).toBe(false);
    expect(controller.following()).toBe(false);
    expect(controller.error()).toContain("already active in another community");
  });

  test("several eligible personas open selection without sending a join", async () => {
    const { api, controller } = await setup({}, [unboundPersona, { ...unboundPersona, personaId: "persona-b" }]);
    await controller.joinCommunity();
    expect(controller.joinPersonaStep()).toBe(true);
    expect(api.join).not.toHaveBeenCalled();
    controller.confirmJoinPersona({ kind: "existing", personaId: "persona-b" });
    await vi.waitFor(() => expect(api.join).toHaveBeenCalledWith("community-a", { kind: "existing", personaId: "persona-b" }));
  });

  test("an elsewhere binding is excluded even if a stale selection supplies it", async () => {
    const { api, controller } = await setup({}, [{ ...unboundPersona,
      communityBinding: { communityId: "other-community", bindingSource: "first_membership" },
    }]);
    await controller.joinCommunity({ kind: "existing", personaId: "persona-a" });
    expect(api.join).not.toHaveBeenCalled();
    expect(controller.joined()).toBe(false);
  });
});
