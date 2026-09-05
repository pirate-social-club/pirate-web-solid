import { ApiClientError } from "@pirate/api-client";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { AuthenticatedSession } from "../../../api/session.ts";
import type { CommunityEngagementApi } from "./community-engagement-api.ts";
import { createCommunityEngagementController } from "./community-engagement-controller.ts";

const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); });

async function setup(overrides: Partial<CommunityEngagementApi> = {}, personas: AuthenticatedSession["personas"] = []) {
  const api: CommunityEngagementApi = {
    readViewerState: vi.fn(async () => ({ membership: "not_member", following: false, followerCount: 0 })),
    resolveJoinAction: vi.fn(async () => ({ kind: "join" })),
    join: vi.fn(async () => ({ status: "joined", personaId: "persona-created" })),
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
      resolveJoinAction: vi.fn(async () => ({ kind: "request" })),
      join: vi.fn(async () => ({ status: "requested", personaId: null })),
    });
    await controller.joinCommunity({ kind: "create_new" });
    expect(api.join).toHaveBeenCalledWith("community-a", undefined);
    expect(controller.joined()).toBe(false);
    expect(controller.message()).toBe("Membership request sent.");
  });

  test("terminal join sends the explicit choice and only then changes membership", async () => {
    const { api, controller } = await setup();
    expect(controller.joined()).toBe(false);
    await controller.joinCommunity({ kind: "existing", personaId: "persona-a" });
    expect(api.join).toHaveBeenCalledWith("community-a", { kind: "existing", personaId: "persona-a" });
    expect(controller.joined()).toBe(true);
  });

  test("zero-persona join can mint without already being a member", async () => {
    const { api, controller } = await setup();
    await controller.joinCommunity();
    expect(api.join).toHaveBeenCalledWith("community-a", { kind: "create_new" });
    expect(controller.joined()).toBe(true);
  });

  test("a binding conflict leaves membership unchanged and explains the next choice", async () => {
    const { controller } = await setup({
      join: vi.fn(async () => { throw new ApiClientError(
        { status: 409, code: "conflict", name: "Conflict", retryable: false },
        { error: { code: "conflict", message: "bound elsewhere", retryable: false } },
      ); }),
    });
    await controller.joinCommunity({ kind: "existing", personaId: "persona-a" });
    expect(controller.joined()).toBe(false);
    expect(controller.following()).toBe(false);
    expect(controller.error()).toContain("already active in another community");
  });
});
