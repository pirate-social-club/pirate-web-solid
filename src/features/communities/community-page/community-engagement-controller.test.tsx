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

async function setup(overrides: Partial<CommunityEngagementApi> = {}, personas: AuthenticatedSession["personas"] = []) {
  const api: CommunityEngagementApi = {
    readViewerState: vi.fn(async () => ({ membership: "not_member" as const, following: false, followerCount: 0 })),
    resolveJoinAction: vi.fn(async () => ({ kind: "join" as const })),
    join: vi.fn(async () => ({ status: "joined" as const, personaId: "persona-created" })),
    follow: vi.fn(async () => ({ following: true, followerCount: 1 })),
    unfollow: vi.fn(async () => ({ following: false, followerCount: 0 })),
    ...overrides,
  };
  const controller = createRoot(dispose => {
    disposers.push(dispose);
    return createCommunityEngagementController({
      api, communityId: "community-a", initialFollowerCount: 0, membershipMode: "open",
      navigate: vi.fn(), returnTo: "/c/community-a",
      resolveSession: async () => ({ status: "authenticated", userId: "account-a", personas }),
    });
  });
  await vi.waitFor(() => expect(controller.postingSession()).toBeDefined());
  await vi.waitFor(() => expect(api.readViewerState).toHaveBeenCalled());
  return { api, controller };
}

describe("terminal community persona choice", () => {
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
  });

  test("zero-persona join can mint without already being a member", async () => {
    const { api, controller } = await setup();
    await controller.joinCommunity();
    expect(api.join).toHaveBeenCalledWith("community-a", { kind: "create_new" });
    expect(controller.joined()).toBe(true);
    expect(controller.joinedPersonaId()).toBe("persona-created");
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
