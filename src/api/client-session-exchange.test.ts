import { describe, expect, it, vi } from "vitest";
import { createSessionApiClient } from "./client.ts";

const unavailableCapabilities = {
  unique_human: { state: "unverified" as const },
  age_over_18: { state: "unverified" as const },
  minimum_age: { state: "unverified" as const },
  nationality: { state: "unverified" as const },
  gender: { state: "unverified" as const },
  wallet_score: { state: "unverified" as const },
};

describe("session exchange client compatibility", () => {
  it("accepts the current api-next global-handle response before verification starts", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      user: {
        id: "user-current",
        object: "user",
        verification_state: "unverified",
        verification_capabilities: unavailableCapabilities,
        created: 1,
      },
      profile: {
        id: "profile-current",
        object: "profile",
        global_handle: {
          id: "handle-current",
          object: "global_handle",
          platform_handle_id: "platform-handle-current",
          owner_persona_id: "persona-current",
          generation: 1,
          state_hash: "state-current",
          cleanup_rename_available: true,
          label: "current-handle",
          tier: "generated",
          status: "active",
          issuance_source: "generated_signup",
          issued_at: 1,
        },
        created: 1,
      },
      onboarding: {
        generated_handle_assigned: true,
        cleanup_rename_available: true,
        unique_human_verification_status: "not_started",
        namespace_verification_status: "not_started",
        community_creation_ready: false,
        missing_requirements: [],
        reddit_verification_status: "not_started",
        reddit_import_status: "not_started",
      },
      wallet_attachments: [],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    const result = await createSessionApiClient({
      origin: "https://web-next-staging.pirate.sc",
      fetchImpl,
    }).post_authSessionExchange({
      body: {
        proof: {
          type: "privy_access_token",
          privy_access_token: "test-access-token",
        },
      },
    });

    expect(result.profile.global_handle).toMatchObject({
      platform_handle_id: "platform-handle-current",
      owner_persona_id: "persona-current",
      generation: 1,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
