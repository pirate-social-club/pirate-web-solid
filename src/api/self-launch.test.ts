import { describe, expect, it } from "vitest";
import {
  createSelfLaunch,
  SelfLaunchError,
  selfUniversalLink,
} from "./self-launch.ts";

const launchPayload = {
  app_name: "Pirate Staging",
  endpoint: "https://api-next-staging.pirate.sc/verification/callbacks/self.pass",
  endpoint_type: "staging_https",
  scope: "pirate-social",
  session_id: "session-1",
  user_id: "00000000-0000-0000-0000-000000000000",
  user_id_type: "uuid",
  disclosures: { minimumAge: 18 },
  dev_mode: false,
  user_defined_data: "",
  version: 2,
} as const;

type SelfAppFields = {
  readonly appName?: unknown;
  readonly scope?: unknown;
  readonly sessionId?: unknown;
  readonly chainID?: unknown;
  readonly version?: unknown;
};

function decodeSelfApp(href: string): SelfAppFields {
  const parsed: unknown = JSON.parse(new URL(href).searchParams.get("selfApp") ?? "");
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("selfApp payload is not an object");
  }
  // SAFETY: the object boundary above was checked; asserted fields are compared
  // against exact expected values by each test.
  return parsed as SelfAppFields;
}

const startedResponse = {
  proof_session_id: "session-1",
  provider_id: "self.pass",
  presentation: {
    kind: "embedded_sdk",
    session_id: "session-1",
    protocol: "self-pass-v1",
    version: "1",
    payload: launchPayload,
  },
  expires_at: "2026-08-19T00:10:00.000Z",
  replayed: false,
} as const;

describe("Self launch harness", () => {
  it("maps the server launch payload onto the universal link", () => {
    const href = selfUniversalLink(launchPayload);
    expect(href.startsWith("https://redirect.self.xyz?selfApp=")).toBe(true);
    const selfApp = decodeSelfApp(href);
    expect(selfApp.appName).toBe("Pirate Staging");
    expect(selfApp.scope).toBe("pirate-social");
    expect(selfApp.sessionId).toBe("session-1");
    expect(selfApp.chainID).toBe(42220);
    expect(selfApp.version).toBe(2);
  });

  it("uses the testnet chain id only in dev mode", () => {
    const selfApp = decodeSelfApp(selfUniversalLink({ ...launchPayload, dev_mode: true }));
    expect(selfApp.chainID).toBe(11142220);
  });

  it("rejects malformed payloads and non-embedded presentations", async () => {
    expect(() => selfUniversalLink({ ...launchPayload, scope: "" })).not.toThrow();
    const launch = createSelfLaunch({
      csrfToken: "csrf",
      // SAFETY: the stub implements only the single client method the adapter
      // calls; the response shape mirrors the generated client contract.
      apiClient: {
        post_verificationSessions: async () => ({
          ...startedResponse,
          presentation: { kind: "redirect", session_id: "s", url: "https://x.test" },
        }),
      } as never,
    });
    await expect(launch.start()).rejects.toBeInstanceOf(SelfLaunchError);
  });

  it("starts the session through the generated client and returns the link", async () => {
    let body: unknown;
    const launch = createSelfLaunch({
      csrfToken: "csrf",
      // SAFETY: the stub implements only the single client method the adapter
      // calls and captures the request body for assertion.
      apiClient: {
        post_verificationSessions: async (request: { body: unknown }) => {
          body = request.body;
          return startedResponse;
        },
      } as never,
    });
    const presentation = await launch.start();
    expect(body).toEqual({ intent_id: "platform.document.age-18", provider_id: "self.pass" });
    expect(presentation.sessionId).toBe("session-1");
    expect(presentation.href.startsWith("https://redirect.self.xyz?selfApp=")).toBe(true);
    expect(presentation.expiresAt).toBe("2026-08-19T00:10:00.000Z");
  });

  it("requires the CSRF token", async () => {
    const launch = createSelfLaunch({
      // SAFETY: the stub is never called because the CSRF check runs first.
      apiClient: { post_verificationSessions: async () => startedResponse } as never,
    });
    await expect(launch.start()).rejects.toMatchObject({ code: "csrf_required" });
  });

  it("rejects an already-completed union response", async () => {
    const launch = createSelfLaunch({
      csrfToken: "csrf",
      // SAFETY: the stub returns the completed union member, which carries no
      // presentation and must be rejected.
      apiClient: {
        post_verificationSessions: async () => ({
          proof_session_id: "session-1",
          provider_id: "self.pass",
          status: "completed",
          replayed: true,
        }),
      } as never,
    });
    await expect(launch.start()).rejects.toMatchObject({ code: "unexpected_response" });
  });
});
