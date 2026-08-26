import { ApiClientError } from "@pirate/api-client";
import { describe, expect, test } from "vitest";

import { resolveSession } from "./session.ts";

function authError(status: number): ApiClientError {
  return new ApiClientError(
    { status, code: "auth_error", name: "AuthError", retryable: false },
    { error: { code: "auth_error", message: "not authenticated", retryable: false } },
  );
}

describe("browser session resolution", () => {
  test("returns authenticated when the session endpoint succeeds", async () => {
    let input: undefined | unknown = "not-called";
    const result = await resolveSession({
      client: {
        get_usersMe: candidate => {
          input = candidate;
          // SAFETY: the resolver reads only the generated response id.
          return Promise.resolve({ id: "user-1" } as never);
        },
        // SAFETY: the resolver reads only the generated persona status and
        // public profile fields supplied by this focused fixture.
        get_personas: () => Promise.resolve({
          personas: [
            {
              persona_id: "persona-active",
              status: "active",
              profile: {
                display_name: "Active Pirate",
                avatar_ref: "avatar-1",
                primary_public_handle: "active-pirate",
              },
            },
            {
              persona_id: "persona-retired",
              status: "retired",
              profile: {
                display_name: "Retired Pirate",
                avatar_ref: null,
                primary_public_handle: null,
              },
            },
          ],
        } as never),
      },
    });

    expect(result).toEqual({
      status: "authenticated",
      userId: "user-1",
      personas: [{
        personaId: "persona-active",
        displayName: "Active Pirate",
        avatarRef: "avatar-1",
        primaryPublicHandle: "active-pirate",
      }],
    });
    expect(input).toBeUndefined();
  });

  test("treats only an explicit 401 as anonymous", async () => {
    const result = await resolveSession({
      client: {
        get_usersMe: async () => { throw authError(401); },
        get_personas: async () => { throw new Error("must not be called"); },
      },
    });
    expect(result).toBe("anonymous");
  });

  test("leaves non-auth failures visible to the route fallback", async () => {
    await expect(resolveSession({
      client: {
        get_usersMe: async () => { throw authError(503); },
        get_personas: async () => { throw new Error("must not be called"); },
      },
    })).rejects.toThrow("not authenticated");
  });
});
