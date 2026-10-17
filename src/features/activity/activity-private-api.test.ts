import { afterEach, expect, test, vi } from "vitest";
import { createSessionApiClient } from "../../api/client.ts";
import { completionFixture, presentationFixture, progressFixture } from "./activity-contract-fixtures.ts";
import { readCompletion, readPresentation, readPrivateProgress, type CompletionTarget } from "./activity-private-api.ts";

afterEach(() => vi.restoreAllMocks());
const study: CompletionTarget = { communityId: "community", postId: "song", personaId: "public-profile", attempt: { kind: "study", session_id: "study-session" } };
const karaoke: CompletionTarget = { ...study, attempt: { kind: "karaoke", session_id: "karaoke-session", attempt_id: "attempt-1" } };
test("all five installed 0.120 GET contracts deserialize their actual wire shapes through the same-origin session client", async () => {
  const transport = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    return Response.json(path.includes("/study/") ? completionFixture : path.includes("/karaoke/") ? { ...completionFixture, attempt: karaoke.attempt }
      : path.endsWith("presentation-persona") ? presentationFixture : path.includes("/posts/") ? progressFixture : { ...progressFixture, scope: { kind: "community", community_id: "community" } });
  });
  const client = createSessionApiClient({ origin: location.origin, fetchImpl: transport }); const signal = new AbortController().signal;
  expect(await readCompletion(study, signal, client)).toEqual(completionFixture);
  expect((await readCompletion(karaoke, signal, client)).attempt).toEqual(karaoke.attempt);
  expect(await readPrivateProgress({ communityId: "community", postId: "song" }, signal, client)).toEqual(progressFixture);
  expect((await readPrivateProgress({ communityId: "community" }, signal, client)).scope.kind).toBe("community");
  expect(await readPresentation({ communityId: "community" }, signal, client)).toEqual(presentationFixture);
  expect(transport.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
    "/api/communities/community/study/v2/sessions/study-session/completion",
    "/api/communities/community/karaoke/sessions/karaoke-session/attempts/attempt-1/completion",
    "/api/communities/community/posts/song/rewards/progress", "/api/communities/community/rewards/progress", "/api/communities/community/rewards/presentation-persona",
  ]);
  for (const [url, init] of transport.mock.calls) { expect(new URL(String(url)).origin).toBe(location.origin); expect(init?.credentials).toBe("same-origin"); expect(init?.method).toBe("GET"); expect(init?.signal).toBe(signal); }
});

test.each(["community_id", "post_id", "persona_id", "attempt"] as const)("completion rejects a different %s without a handwritten wire cast", async field => {
  const body = { ...completionFixture, [field]: field === "attempt" ? { kind: "study", session_id: "different" } : "different" };
  const client = createSessionApiClient({ origin: location.origin, fetchImpl: async () => Response.json(body) });
  await expect(readCompletion(study, new AbortController().signal, client)).rejects.toThrow("activity_completion_identity_mismatch");
});
test("the exact Karaoke attempt, progress scope and nested presentation community are checked", async () => {
  const transport = vi.fn(async () => Response.json({ ...completionFixture, attempt: { ...karaoke.attempt, attempt_id: "different" } }));
  const client = createSessionApiClient({ origin: location.origin, fetchImpl: transport }); const signal = new AbortController().signal;
  await expect(readCompletion(karaoke, signal, client)).rejects.toThrow("activity_completion_identity_mismatch");
  transport.mockResolvedValueOnce(Response.json({ ...progressFixture, scope: { kind: "community", community_id: "community" } }));
  await expect(readPrivateProgress({ communityId: "community", postId: "song" }, signal, client)).rejects.toThrow("activity_progress_scope_mismatch");
  transport.mockResolvedValueOnce(Response.json({ ...presentationFixture, selection: { status: "selected", presentation: { object: "activity_presentation", community_id: "different", persona_id: "public-profile", updated_at: "2026-10-16T00:00:00Z" } } }));
  await expect(readPresentation({ communityId: "community" }, signal, client)).rejects.toThrow("activity_presentation_scope_mismatch");
});
test("generated response validation rejects missing week marks and incomplete completion decisions", async () => {
  const transport = vi.fn(async () => Response.json({ ...progressFixture, week: { start_day: "2026-10-12", end_day: "2026-10-18" } }));
  const client = createSessionApiClient({ origin: location.origin, fetchImpl: transport }); const signal = new AbortController().signal;
  await expect(readPrivateProgress({ communityId: "community", postId: "song" }, signal, client)).rejects.toThrow();
  transport.mockResolvedValueOnce(Response.json({ ...completionFixture, decision: { status: "qualified" } }));
  await expect(readCompletion(study, signal, client)).rejects.toThrow();
});
