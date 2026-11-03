import type { CommunityEngagementApiClient } from "./community-engagement-api.ts";
import { describe, expect, test, vi } from "vitest";
import { ApiClientError, ApiClientProtocolError, ApiClientResponseValidationError, ApiClientUnexpectedError } from "@pirate/api-client";
import { SessionAuthorityChangedError } from "../../../api/browser-session-events.ts";
import { reportCommunityMembershipFailure } from "./community-membership-diagnostic.ts";

import {
  CommunityEngagementLocalError,
  createCommunityEngagementApi,
  projectCommunityJoinAction,
} from "./community-engagement-api.ts";

const communityId = "community_123e4567-e89b-42d3-a456-426614174000";

describe("bounded membership failure fields", () => {
  const privateBody = { error: { code: "private_code", message: "private_body", retryable: false,
    details: { private_field: "private_value" } }, request_id: "private_request" };
  test.each([
    [new ApiClientError({ status: 401, code: "auth_error", name: "private_name", retryable: false }, privateBody), "ApiClientError", "api", 401],
    [new ApiClientUnexpectedError(503, privateBody), "ApiClientUnexpectedError", "api", 503],
    [new ApiClientProtocolError("private_protocol", 502), "ApiClientProtocolError", "protocol", 502],
    [new ApiClientResponseValidationError("private_operation", 200, "/private_path"), "ApiClientResponseValidationError", "response_validation", 200],
    [new CommunityEngagementLocalError("invalid_response"), "CommunityEngagementLocalError", "local_validation", undefined],
    [new SessionAuthorityChangedError(), "SessionAuthorityChangedError", "session_changed", undefined],
    [new TypeError("private_transport"), "TypeError", "type_or_network", undefined],
    [new DOMException("private_abort", "AbortError"), "DOMException", "aborted", undefined],
    [new Error("private_unknown"), "Error", "unknown", undefined],
    [{ name: "private_name", status: 401, body: "private_body" }, "unknown", "unknown", undefined],
  ])("classifies safe %s fields without raw error content", (failure, errorClass, kind, status) => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      reportCommunityMembershipFailure(failure, { elapsedMs: 12.7, recentSessionChange: true });
      expect(diagnostic).toHaveBeenCalledExactlyOnceWith("community.membership.read.failed", {
        errorClass, kind, status, elapsedMs: 13, recentSessionChange: true,
      });
      expect(JSON.stringify(diagnostic.mock.calls)).not.toContain("private");
    } finally { diagnostic.mockRestore(); }
  });

  test("ignores invalid HTTP status and nonfinite timing without logging raw fields", () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      reportCommunityMembershipFailure(new ApiClientProtocolError("private", 999), {
        elapsedMs: Infinity, recentSessionChange: false,
      });
      expect(diagnostic).toHaveBeenCalledExactlyOnceWith("community.membership.read.failed", {
        errorClass: "ApiClientProtocolError", kind: "protocol", status: undefined,
        elapsedMs: 0, recentSessionChange: false,
      });
    } finally { diagnostic.mockRestore(); }
  });

  test("a failed console sink cannot change membership recovery", () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => { throw new Error("private_sink"); });
    try {
      expect(() => reportCommunityMembershipFailure(new TypeError("private"), {
        elapsedMs: 2, recentSessionChange: false,
      })).not.toThrow();
    } finally { diagnostic.mockRestore(); }
  });
});

type JoinEligibilityV1 = Exclude<Awaited<ReturnType<CommunityEngagementApiClient["get_communitiesCommunityIdJoinEligibility"]>>, { readonly join_eligibility_version: "provider_choice_v2" }>;

function eligibility(
  overrides: Partial<JoinEligibilityV1> = {},
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
    await expect(port.join(communityId)).resolves.toEqual({ status: "requested", personaId: null });
    expect(join).toHaveBeenCalledWith(
      { path: { communityId }, body: undefined },
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


describe("composed join provider choice", () => {
  const composed = {
    ...eligibility(), join_eligibility_version: "provider_choice_v2" as const,
    status: "verification_required" as const, joinable_now: false,
    requirements: {
      human_identity: { requirement: "human_identity" as const, status: "satisfied" as const, provider_id: "very.web" as const },
      nationality: { requirement: "nationality" as const, status: "pending" as const,
        requirement_hash: "hash-nationality", provider_id: "self.pass", accepted_provider_ids: ["self.pass", "zkpassport"],
        ceremony_intent_id: "nationality-child-1", generation: 1 },
    },
    next_action: { kind: "start_verification" as const, requirement: "nationality" as const, provider_id: "self.pass", intent_id: "nationality-child-1" },
  };
  test("carries both server-owned choices and refuses a mismatched child or unsupported alternative", () => {
    expect(projectCommunityJoinAction(composed, communityId)).toMatchObject({
      kind: "verify_document", requirement: { acceptedProviderIds: ["self.pass", "zkpassport"], intentId: "nationality-child-1", generation: 1 },
    });
    expect(() => projectCommunityJoinAction({ ...composed, next_action: { ...composed.next_action, intent_id: "stale-child" } }, communityId)).toThrow();
    expect(() => projectCommunityJoinAction({ ...composed, requirements: { ...composed.requirements,
      nationality: { ...composed.requirements.nationality, accepted_provider_ids: ["self.pass", "unknown"] },
    } }, communityId)).toThrow();
  });
});
