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
          // SAFETY: the resolver only needs a successful promise; it never reads the response.
          return Promise.resolve({} as never);
        },
      },
    });

    expect(result).toBe("authenticated");
    expect(input).toBeUndefined();
  });

  test("treats only an explicit 401 as anonymous", async () => {
    const result = await resolveSession({
      client: { get_usersMe: async () => { throw authError(401); } },
    });
    expect(result).toBe("anonymous");
  });

  test("leaves non-auth failures visible to the route fallback", async () => {
    await expect(resolveSession({
      client: { get_usersMe: async () => { throw authError(503); } },
    })).rejects.toThrow("not authenticated");
  });
});
