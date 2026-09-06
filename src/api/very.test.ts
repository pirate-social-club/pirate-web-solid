import { afterEach, describe, expect, it, vi } from "vitest";
import {
  VERY_WEB_PROVIDER_ID,
  VeryWebClientError,
  createVeryWebCeremony,
  joinVeryCommunity,
  parseVeryCommunityAction,
  parseVeryJoinEligibility,
  parseVeryWebPresentation,
  resolveVeryCommunityAction,
} from "./very.ts";

const proofSessionId = "proof-session-1";

function pendingStart() {
  return {
    proof_session_id: proofSessionId,
    provider_id: "very.web",
    presentation: {
      kind: "embedded_sdk",
      session_id: proofSessionId,
      protocol: "very-widget",
      version: "1",
      payload: {
        app_id: "very-app-staging",
        api_url: "https://api.very.example/api/v1",
        context: "Veros - Palm Verification Timestamp",
        type_id: "3",
        query: JSON.stringify({
          externalNullifier: "Pirate - Community Join - curated-human-membership-v1",
          pseudonym: proofSessionId,
        }),
        verify_url: "https://verify.very.example/api/v1/verify",
        mobile: {
          uri: "veros://verify?sessionId=bridge-session-1&key=YWJj&action=verify",
          poll_url: `/verification/sessions/${proofSessionId}/complete`,
        },
      },
    },
    expires_at: "2099-08-20T12:05:00.000Z",
    replayed: false,
  };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("Very web presentation", () => {
  it("accepts the server-owned embedded presentation and mobile deeplink", () => {
    expect(parseVeryWebPresentation(pendingStart())).toEqual({
      kind: "pending",
      presentation: {
        proofSessionId,
        expiresAt: "2099-08-20T12:05:00.000Z",
        appId: "very-app-staging",
        apiUrl: "https://api.very.example/api/v1",
        context: "Veros - Palm Verification Timestamp",
        typeId: "3",
        query: JSON.stringify({
          externalNullifier: "Pirate - Community Join - curated-human-membership-v1",
          pseudonym: proofSessionId,
        }),
        verifyUrl: "https://verify.very.example/api/v1/verify",
        mobileUri: "veros://verify?sessionId=bridge-session-1&key=YWJj&action=verify",
        pollUrl: `/verification/sessions/${proofSessionId}/complete`,
      },
    });
  });

  it("fails closed on a changed protocol, extra payload field, or unsafe URL", () => {
    const protocolChanged = structuredClone(pendingStart());
    protocolChanged.presentation.protocol = "unknown";
    expect(() => parseVeryWebPresentation(protocolChanged)).toThrowError(
      expect.objectContaining({ code: "invalid_presentation" }),
    );

    const extraField = structuredClone(pendingStart());
    Object.assign(extraField.presentation.payload, { client_fetch_url: "https://attacker.invalid" });
    expect(() => parseVeryWebPresentation(extraField)).toThrowError(VeryWebClientError);

    const unsafeApi = structuredClone(pendingStart());
    unsafeApi.presentation.payload.api_url = "http://api.very.example/api/v1";
    expect(() => parseVeryWebPresentation(unsafeApi)).toThrowError(VeryWebClientError);
  });

  it("represents an already-completed start as a truthful replay", () => {
    expect(parseVeryWebPresentation({
      proof_session_id: proofSessionId,
      provider_id: "very.web",
      status: "completed",
      replayed: true,
    })).toEqual({
      kind: "completed",
      completion: { proofSessionId, status: "completed", replayed: true },
    });
  });
});

describe("Very web ceremony", () => {
  it("distinguishes verification, joinable, and already-joined community actions", () => {
    expect(parseVeryCommunityAction({
      community: "community-gated-1",
      status: "verification_required",
      joinable_now: false,
      human_verification_lane: "very",
      next_action: {
        kind: "start_verification",
        provider_id: VERY_WEB_PROVIDER_ID,
        intent_id: "join-intent-from-server",
      },
    }, "community-gated-1")).toEqual({ kind: "verify", intentId: "join-intent-from-server" });
    expect(parseVeryCommunityAction({
      community: "community-gated-1",
      status: "joinable",
      joinable_now: true,
      next_action: { kind: "join" },
    }, "community-gated-1")).toEqual({ kind: "join" });
    expect(parseVeryCommunityAction({
      community: "community-gated-1",
      status: "already_joined",
      joinable_now: false,
      next_action: { kind: "none", reason: "already_joined" },
    }, "community-gated-1")).toEqual({ kind: "joined" });
    expect(parseVeryCommunityAction({
      community: "community-gated-1",
      status: "verification_required",
      joinable_now: false,
      human_verification_lane: "very",
      next_action: {
        kind: "wait",
        reason_code: "verification_pending",
        retry_after_seconds: 2,
      },
    }, "community-gated-1")).toEqual({ kind: "wait", retryAfterMs: 2_000 });
    expect(() => parseVeryCommunityAction({
      community: "community-other",
      status: "joinable",
      joinable_now: true,
      next_action: { kind: "join" },
    }, "community-gated-1")).toThrowError(expect.objectContaining({ code: "join_not_ready" }));
  });

  it("reuses completed proof eligibility and joins through the authenticated endpoint", async () => {
    // SAFETY: this test deliberately supplies the browser guard used by the client adapter.
    globalThis.window = {} as Window & typeof globalThis;
    const eligibility = vi.fn(async () => ({
      community: "community-gated-1",
      status: "joinable" as const,
      joinable_now: true,
      next_action: { kind: "join" as const },
    }));
    const join = vi.fn(async () => ({
      community: "community-gated-1",
      status: "joined" as const,
    }));
    // SAFETY: this fake implements the two generated methods used by these community helpers.
    const apiClient = {
      get_communitiesCommunityIdJoinEligibility: eligibility,
      post_communitiesCommunityIdJoin: join,
    } as never;

    await expect(resolveVeryCommunityAction({
      communityId: "community-gated-1",
      apiClient,
      csrfToken: "csrf-token",
    })).resolves.toEqual({ kind: "join" });
    await expect(joinVeryCommunity({
      communityId: "community-gated-1",
      persona: { kind: "create_new" },
      apiClient,
      csrfToken: "csrf-token",
    })).resolves.toEqual({ communityId: "community-gated-1", status: "joined" });
    expect(join).toHaveBeenCalledWith(
      { path: { communityId: "community-gated-1" }, body: { persona: { kind: "create_new" } } },
      expect.objectContaining({ credentials: "same-origin", headers: expect.any(Headers) }),
    );
  });

  it("resolves a community ID to the server-issued join intent", async () => {
    // SAFETY: this test deliberately supplies the browser guard used by the client adapter.
    globalThis.window = {} as Window & typeof globalThis;
    const start = vi.fn(async () => pendingStart());
    const eligibility = vi.fn(async () => ({
      status: "verification_required" as const,
      human_verification_lane: "very" as const,
      next_action: {
        kind: "start_verification" as const,
        provider_id: VERY_WEB_PROVIDER_ID,
        intent_id: "join-intent-from-server",
      },
    }));
    const ceremony = await createVeryWebCeremony({
      communityId: "community-gated-1",
      // SAFETY: this fake implements exactly the three generated methods used by the client adapter.
      apiClient: {
        get_communitiesCommunityIdJoinEligibility: eligibility,
        post_verificationSessions: start,
        post_verificationSessionsProofSessionIdComplete: vi.fn(),
      } as never,
      csrfToken: "csrf-token",
    });

    expect(ceremony.presentation?.proofSessionId).toBe(proofSessionId);
    expect(eligibility).toHaveBeenCalledWith(
      { path: { communityId: "community-gated-1" } },
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(start).toHaveBeenCalledWith(
      { body: { intent_id: "join-intent-from-server", provider_id: VERY_WEB_PROVIDER_ID } },
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("posts the complete Community creation union body through the real adapter", async () => {
    // SAFETY: this test deliberately supplies the browser guard used by the client adapter.
    globalThis.window = {} as Window & typeof globalThis;
    const start = vi.fn(async () => pendingStart());
    const ceremony = await createVeryWebCeremony({
      creation: {
        creationIntentId: "creation-intent-1",
        ceremonyIntentId: "creation-ceremony-1",
        providerId: VERY_WEB_PROVIDER_ID,
        requirement: "human_identity",
        generation: 3,
        expectedRevision: 7,
      },
      // SAFETY: this fake implements exactly the generated methods used by the adapter.
      apiClient: {
        post_verificationSessions: start,
        post_verificationSessionsProofSessionIdComplete: vi.fn(),
      } as never,
      csrfToken: "csrf-token",
      idempotencyKey: () => "creation-start-idem-1",
    });

    expect(ceremony.presentation?.proofSessionId).toBe(proofSessionId);
    expect(start).toHaveBeenCalledWith(
      {
        body: {
          provider_id: VERY_WEB_PROVIDER_ID,
          creation_intent_id: "creation-intent-1",
          ceremony_intent_id: "creation-ceremony-1",
          requirement: "human_identity",
          generation: 3,
          expected_revision: 7,
          idempotency_key: "creation-start-idem-1",
        },
      },
      expect.objectContaining({ credentials: "same-origin", headers: expect.any(Headers) }),
    );
  });

  it("rejects a malformed Community creation target before calling the API", async () => {
    // SAFETY: this test deliberately supplies the browser guard used by the client adapter.
    globalThis.window = {} as Window & typeof globalThis;
    const start = vi.fn();
    await expect(createVeryWebCeremony({
      creation: {
        creationIntentId: "creation-intent-1",
        ceremonyIntentId: "creation-ceremony-1",
        providerId: VERY_WEB_PROVIDER_ID,
        requirement: "human_identity",
        generation: 0,
        expectedRevision: 7,
      },
      // SAFETY: this fake implements exactly the generated methods inspected before validation exits.
      apiClient: {
        post_verificationSessions: start,
        post_verificationSessionsProofSessionIdComplete: vi.fn(),
      } as never,
      csrfToken: "csrf-token",
    })).rejects.toMatchObject({ code: "invalid_presentation" });
    expect(start).not.toHaveBeenCalled();
  });

  it("fails closed when eligibility does not issue a Very verification intent", () => {
    expect(() => parseVeryJoinEligibility({
      status: "verification_required",
      human_verification_lane: "self",
      next_action: { kind: "start_verification", provider_id: "very.web", intent_id: "intent-1" },
    })).toThrowError(expect.objectContaining({ code: "join_not_ready" }));
  });

  it("starts with CSRF credentials and submits one idempotent server-side bridge completion", async () => {
    // SAFETY: this test deliberately supplies the browser guard used by the client adapter.
    globalThis.window = {} as Window & typeof globalThis;
    const start = vi.fn(async () => pendingStart());
    const complete = vi.fn(async () => ({
      proof_session_id: proofSessionId,
      status: "completed" as const,
      replayed: false,
    }));
    const ceremony = await createVeryWebCeremony({
      intentId: "join-intent-1",
      // SAFETY: this fake implements exactly the two generated methods used by the client adapter.
      apiClient: {
        post_verificationSessions: start,
        post_verificationSessionsProofSessionIdComplete: complete,
      } as never,
      csrfToken: "csrf-token",
      idempotencyKey: () => "very-idem-1",
    });

    expect(ceremony.presentation?.mobileUri).toContain("veros://verify");
    await expect(ceremony.pollBridge()).resolves.toEqual({
      proofSessionId,
      status: "completed",
      replayed: false,
    });
    expect(start).toHaveBeenCalledWith(
      { body: { intent_id: "join-intent-1", provider_id: "very.web" } },
      expect.objectContaining({
        credentials: "same-origin",
        headers: expect.any(Headers),
      }),
    );
    expect(complete).toHaveBeenCalledWith(
      {
        path: { proofSessionId },
        body: { idempotency_key: "very-idem-1", payload: { mode: "bridge" } },
      },
      expect.objectContaining({ credentials: "same-origin" }),
    );
    await expect(ceremony.pollBridge()).rejects.toMatchObject({ code: "ceremony_cancelled" });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("submits the desktop widget result only as an opaque provider payload reference", async () => {
    // SAFETY: this test deliberately supplies the browser guard used by the client adapter.
    globalThis.window = {} as Window & typeof globalThis;
    const complete = vi.fn(async () => ({
      proof_session_id: proofSessionId,
      status: "completed" as const,
      replayed: false,
    }));
    const ceremony = await createVeryWebCeremony({
      intentId: "join-intent-widget-1",
      // SAFETY: this fake implements exactly the two generated methods used by the client adapter.
      apiClient: {
        post_verificationSessions: vi.fn(async () => pendingStart()),
        post_verificationSessionsProofSessionIdComplete: complete,
      } as never,
      csrfToken: "csrf-token",
      idempotencyKey: () => "very-widget-idem-1",
    });

    await expect(ceremony.completeWithWidget("opaque-provider-proof")).resolves.toEqual({
      proofSessionId,
      status: "completed",
      replayed: false,
    });
    expect(complete).toHaveBeenCalledWith(
      {
        path: { proofSessionId },
        body: {
          idempotency_key: "very-widget-idem-1",
          payload: { mode: "widget", proof: "opaque-provider-proof" },
        },
      },
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("does not start during SSR", async () => {
    const start = vi.fn();
    await expect(createVeryWebCeremony({
      intentId: "join-intent-1",
      // SAFETY: this fake implements exactly the two generated methods used by the client adapter.
      apiClient: {
        post_verificationSessions: start,
        post_verificationSessionsProofSessionIdComplete: vi.fn(),
      } as never,
      csrfToken: "csrf-token",
    })).rejects.toMatchObject({ code: "browser_required" });
    expect(start).not.toHaveBeenCalled();
  });
});
