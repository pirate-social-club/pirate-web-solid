import { afterEach, describe, expect, it, vi } from "vitest";
import {
  VeryWebClientError,
  createVeryWebCeremony,
  parseVeryWebPresentation,
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
