import type { CommunityEngagementApiClient } from "./community-engagement-api.ts";
import { describe, expect, test, vi } from "vitest";

import {
  CommunityEngagementLocalError,
  createCommunityEngagementApi,
  projectCommunityJoinAction,
} from "./community-engagement-api.ts";

const communityId = "community_123e4567-e89b-42d3-a456-426614174000";

function eligibility(
  overrides: Partial<Awaited<ReturnType<CommunityEngagementApiClient["get_communitiesCommunityIdJoinEligibility"]>>> = {},
) {
  return {
    community: communityId,
    membership_mode: "open" as const,
    human_verification_lane: null,
    joinable_now: true,
    status: "joinable" as const,
    membership_gate_summaries: [],
    next_action: { kind: "join" as const },
    ...overrides,
  };
}

function client(overrides: Partial<CommunityEngagementApiClient> = {}): CommunityEngagementApiClient {
  return {
    get_communitiesCommunityIdPreview: vi.fn(async () => ({
      id: communityId,
      object: "community_preview" as const,
      display_name: "Harbor",
      membership_mode: "open" as const,
      human_verification_lane: null,
      follower_count: 20,
      moderators: [],
      membership_gate_summaries: [],
      rules: [],
      viewer_membership_status: "not_member" as const,
      viewer_following: false,
      created: 1,
    })),
    get_communitiesCommunityIdJoinEligibility: vi.fn(async () => eligibility()),
    post_communitiesCommunityIdJoin: vi.fn(async () => ({ community: communityId, status: "joined" as const })),
    post_communitiesCommunityIdFollow: vi.fn(async () => ({ community: communityId, following: true, follower_count: 21 })),
    post_communitiesCommunityIdUnfollow: vi.fn(async () => ({ community: communityId, following: false, follower_count: 20 })),
    ...overrides,
  };
}

describe("Community engagement API", () => {
  test("projects server-owned join, request, verification and terminal actions", () => {
    expect(projectCommunityJoinAction(eligibility(), communityId)).toEqual({ kind: "join" });
    expect(projectCommunityJoinAction(eligibility({
      membership_mode: "request",
      joinable_now: false,
      status: "requestable",
      next_action: { kind: "request_membership" },
    }), communityId)).toEqual({ kind: "request" });
    expect(projectCommunityJoinAction(eligibility({
      membership_mode: "gated",
      human_verification_lane: "very",
      joinable_now: false,
      status: "verification_required",
      next_action: { kind: "start_verification", provider_id: "very.web", intent_id: "join-intent-1" },
    }), communityId)).toEqual({ kind: "verify", providerId: "very.web", intentId: "join-intent-1" });
    expect(projectCommunityJoinAction(eligibility({
      joinable_now: false,
      status: "already_joined",
      next_action: { kind: "none", reason: "already_joined" },
    }), communityId)).toEqual({ kind: "joined" });
    expect(projectCommunityJoinAction(eligibility({
      membership_mode: "request",
      joinable_now: false,
      status: "pending_request",
      next_action: { kind: "wait", reason_code: "membership_pending" },
    }), communityId)).toEqual({ kind: "pending" });
    expect(projectCommunityJoinAction(eligibility({
      membership_mode: "gated",
      human_verification_lane: "very",
      joinable_now: false,
      status: "verification_required",
      next_action: { kind: "wait", reason_code: "verification_pending" },
    }), communityId)).toEqual({ kind: "pending" });
    expect(projectCommunityJoinAction(eligibility({
      joinable_now: false,
      status: "banned",
      next_action: { kind: "blocked", reason: "banned" },
    }), communityId)).toEqual({ kind: "blocked", reason: "banned" });
  });

  test("reads authenticated viewer state and applies server follower counts", async () => {
    const port = createCommunityEngagementApi({ client: client(), readCsrfToken: () => "csrf-1" });
    await expect(port.readViewerState(communityId)).resolves.toEqual({
      membership: "not_member",
      following: false,
      followerCount: 20,
    });
    await expect(port.follow(communityId)).resolves.toEqual({ following: true, followerCount: 21 });
    await expect(port.unfollow(communityId)).resolves.toEqual({ following: false, followerCount: 20 });
  });

  test("sends current CSRF on writes and preserves requested membership", async () => {
    const join = vi.fn<CommunityEngagementApiClient["post_communitiesCommunityIdJoin"]>(
      async () => ({ community: communityId, status: "requested" as const }),
    );
    const apiClient = client({ post_communitiesCommunityIdJoin: join });
    const port = createCommunityEngagementApi({ client: apiClient, readCsrfToken: () => "csrf-current" });
    await expect(port.join(communityId)).resolves.toEqual({ status: "requested" });
    expect(join).toHaveBeenCalledWith(
      { path: { communityId } },
      expect.objectContaining({ credentials: "same-origin" }),
    );
    // SAFETY: the adapter emits a plain string record; the cast only bridges the generated client's readonly tuple alternative.
    const headers = new Headers(join.mock.calls[0]?.[1]?.headers as HeadersInit | undefined);
    expect(headers.get("x-csrf-token")).toBe("csrf-current");
  });

  test("fails closed without CSRF or on mismatched response identity", async () => {
    const noCsrf = createCommunityEngagementApi({ client: client(), readCsrfToken: () => undefined });
    await expect(noCsrf.follow(communityId)).rejects.toEqual(expect.objectContaining({ code: "csrf_required" }));
    expect(() => projectCommunityJoinAction(eligibility({ community: "community_other" }), communityId))
      .toThrow(CommunityEngagementLocalError);
  });
});
