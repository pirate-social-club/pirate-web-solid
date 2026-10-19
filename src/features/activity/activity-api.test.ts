import { afterEach, expect, test, vi } from "vitest";
import { createApiClient } from "../../api/client.ts";
import { readActivityLeaderboard, setActivityPresentation, type ActivityLeaderboardData } from "./activity-api.ts";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const empty: ActivityLeaderboardData = { object: "activity_streak_leaderboard", scope: { kind: "song", community_id: "community", post_id: "song" }, day_semantics: "account_pinned_iana_timezone_v1", entries: [], viewer_standing: null };

test.each([false, true])("generated song read uses same-origin /api with credential policy %s", async authenticated => {
  const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json(empty)); vi.stubGlobal("fetch", transport);
  await expect(readActivityLeaderboard({ communityId: "community", postId: "song" }, authenticated, new AbortController().signal)).resolves.toEqual(empty);
  const [input, init] = transport.mock.calls[0]!;
  const url = new URL(String(input));
  expect(url.pathname).toBe("/api/communities/community/posts/song/rewards/leaderboard");
  expect(url.origin).toBe(location.origin); expect(init?.credentials).toBe(authenticated ? "same-origin" : "omit");
  expect(init?.signal).toBeInstanceOf(AbortSignal);
});

test("generated community read and scope validation reject cross-song/community results", async () => {
  const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({ ...empty, scope: { kind: "community", community_id: "community" } }));
  const client = createApiClient({ origin: location.origin, fetchImpl: transport });
  await readActivityLeaderboard({ communityId: "community" }, false, new AbortController().signal, client);
  expect(String(transport.mock.calls[0]?.[0])).toContain("/api/communities/community/rewards/leaderboard");
  await expect(readActivityLeaderboard({ communityId: "community", postId: "song" }, false, new AbortController().signal, client)).rejects.toThrow("activity_scope_mismatch");
});

test("presenting persona uses the generated PUT, same-origin CSRF and stable command key", async () => {
  const transport = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({ object: "activity_presentation", community_id: "community", persona_id: "profile", updated_at: "2026-10-16T00:00:00Z" }));
  const client = createApiClient({ origin: location.origin, fetchImpl: transport });
  await expect(setActivityPresentation({ communityId: "community" }, "profile", "command", new AbortController().signal, client)).rejects.toThrow("activity_csrf_unavailable");
  expect(transport).not.toHaveBeenCalled();
  vi.spyOn(document, "cookie", "get").mockReturnValue("__Host-pirate_csrf=csrf-value");
  await setActivityPresentation({ communityId: "community" }, "profile", "command", new AbortController().signal, client);
  const [input, init] = transport.mock.calls[0]!;
  const url = new URL(String(input));
  expect(url.pathname).toBe("/api/communities/community/rewards/presentation-persona");
  expect(init?.method).toBe("PUT"); expect(init?.credentials).toBe("same-origin");
  expect(new Headers(init?.headers).get("x-csrf-token")).toBe("csrf-value");
  expect(JSON.parse(String(init?.body))).toEqual({ persona_id: "profile", idempotency_key: "command" });
});
