import { describe, expect, test, vi } from "vitest";
import type { PostVerificationSessionsResponse } from "@pirate/api-client";
import { createSelfPassCeremony, parseSelfPassLaunch } from "./self-pass.ts";

const launch = {
  app_name: "Pirate", endpoint: "https://api-next-staging.pirate.sc/verification/self/callback",
  endpoint_type: "staging_https", scope: "pirate-social", session_id: "proof-session-1",
  user_id: "b13cfc26-cb6f-4d25-8d12-8888a57c3bdd", user_id_type: "uuid",
  disclosures: { nationality: true, expiry_date: true }, dev_mode: true,
  user_defined_data: "request-bound-data", version: 2,
};
function response(payload: unknown = launch): PostVerificationSessionsResponse {
  return { proof_session_id: "proof-session-1", provider_id: "self.pass", expires_at: "2026-09-14T12:00:00Z", replayed: false,
    presentation: { kind: "embedded_sdk", session_id: "proof-session-1", protocol: "self", version: "2", payload } };
}
describe("Self document launcher", () => {
  test("starts the exact issued child and builds a pure SDK link with bound disclosure fields", async () => {
    const post = vi.fn(async () => response());
    const ceremony = await createSelfPassCeremony({ intentId: "issued-child-2", csrfToken: "csrf-test", apiClient: { post_verificationSessions: post } });
    expect(post).toHaveBeenCalledWith({ body: { intent_id: "issued-child-2", provider_id: "self.pass" } }, expect.objectContaining({ credentials: "same-origin" }));
    const url = new URL(ceremony.url);
    expect(url.origin).toBe("https://redirect.self.xyz");
    const config = JSON.parse(url.searchParams.get("selfApp") ?? "null");
    expect(config).toMatchObject({ sessionId: "proof-session-1", userDefinedData: "request-bound-data", disclosures: { nationality: true, expiry_date: true }, chainID: 11142220 });
    expect(config).not.toHaveProperty("country");
    expect(config.deeplinkCallback).toBe("");
  });
  test("rejects unexpected personal disclosures and mismatched session binding", () => {
    expect(() => parseSelfPassLaunch(response({ ...launch, disclosures: { nationality: true, name: true } }))).toThrow("invalid_presentation");
    expect(() => parseSelfPassLaunch(response({ ...launch, session_id: "other" }))).toThrow("invalid_presentation");
    expect(() => parseSelfPassLaunch(response({ ...launch, endpoint: "http://unsafe.test" }))).toThrow("invalid_presentation");
  });
  test("maps the age predicate without requesting a birth date and never starts without CSRF", async () => {
    expect(parseSelfPassLaunch(response({ ...launch, disclosures: { minimum_age: 18, expiry_date: true } })).disclosures).toEqual({ minimumAge: 18, expiry_date: true });
    const post = vi.fn();
    await expect(createSelfPassCeremony({ intentId: "issued", apiClient: { post_verificationSessions: post } })).rejects.toMatchObject({ code: "csrf_required" });
    expect(post).not.toHaveBeenCalled();
  });
});
