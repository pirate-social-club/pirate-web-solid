import { describe, expect, test } from "bun:test";
import { toKaraokeSessionDescriptor, type ApiKaraokeSession } from "./api-contracts";

describe("api-next karaoke contract adapter", () => {
  test("maps the v1 session wire shape without introducing audio fields", () => {
    const session: ApiKaraokeSession = {
      attempt: "attempt-1",
      id: "session-1",
      object: "karaoke_session",
      protocol_version: 1,
      scoring_policy: { kind: "enabled", model: "model", provider: "openai", retention: "not_stored" },
      session_expires_at: 200,
      token_expires_at: 100,
      websocket_url: "wss://example.test/karaoke",
    };

    expect(toKaraokeSessionDescriptor(session)).toEqual({
      attempt: "attempt-1",
      id: "session-1",
      protocolVersion: 1,
      sessionExpiresAt: 200,
      tokenExpiresAt: 100,
      websocketUrl: "wss://example.test/karaoke",
    });
  });
});
