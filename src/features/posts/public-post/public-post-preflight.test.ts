import { describe, expect, it, vi } from "vitest";
import {
  publicPostResponsePolicy,
  resolvePublicPostPreflight,
} from "./public-post-preflight.ts";

describe("public post SSR preflight", () => {
  it("rejects malformed input and unsupported methods without an API request", async () => {
    const fetchImpl = vi.fn();
    await expect(resolvePublicPostPreflight(
      new Request("https://pirate.sc/posts/%252F"),
      undefined,
      fetchImpl,
    )).resolves.toMatchObject({ state: { kind: "invalid", status: 400 } });
    await expect(resolvePublicPostPreflight(
      new Request("https://pirate.sc/posts/hello", { method: "POST" }),
      "https://api-next.pirate.sc",
      fetchImpl,
    )).resolves.toMatchObject({ state: { kind: "method-not-allowed", status: 405 } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("forwards only the session cookie needed by the optional-viewer guard", async () => {
    let seen: { url: URL; headers: Headers; credentials: RequestCredentials | undefined } | undefined;
    const state = await resolvePublicPostPreflight(
      new Request("https://pirate.sc/posts/hello?tracking=1", {
        headers: {
          authorization: "Bearer browser-controlled",
          cookie: "__Host-pirate_session=session-value; __Host-pirate_csrf=csrf-value",
          "x-csrf-token": "browser-controlled",
        },
      }),
      "https://api-next.pirate.sc",
      async (input, init) => {
        seen = {
          url: new URL(input instanceof Request ? input.url : input.toString()),
          headers: new Headers(init?.headers),
          credentials: init?.credentials,
        };
        return Response.json({
          error: { code: "not_found", message: "Not found", retryable: false },
        }, { status: 404 });
      },
    );
    expect(state?.state).toEqual({ kind: "not-found", status: 404 });
    expect(seen?.url.pathname).toBe("/public/posts/by-slug");
    expect(seen?.url.searchParams.get("slug")).toBe("hello");
    expect(seen?.headers.get("cookie")).toContain("__Host-pirate_session=session-value");
    expect(seen?.headers.get("cookie")).not.toContain("pirate_csrf");
    expect(seen?.headers.get("authorization")).toBeNull();
    expect(seen?.headers.get("x-csrf-token")).toBeNull();
    expect(seen?.credentials).toBe("omit");
  });

  it("partitions guarded HTML and commits no redirect policy after streaming", () => {
    const policy = publicPostResponsePolicy({
      kind: "age-locked",
      status: 200,
      activity: "detail",
      locked: {
        kind: "age_locked",
        content_rating: "adult_18",
        next_action: { kind: "verify_minimum_age", minimum_age: 18 },
      },
    });
    expect(policy.headers.get("cache-control")).toBe("private, no-store");
    expect(policy.headers.get("vary")).toContain("Cookie");
  });
});
