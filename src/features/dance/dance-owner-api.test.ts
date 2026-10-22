import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { GetUsersMeResponse } from "@pirate/api-client";
import { createSessionApiClient } from "../../api/client";
import { establishSessionAuthority, forgetSessionAuthority, refreshSessionAuthority } from "../../api/browser-session-events";
import { createDanceOwnerApi, type DanceOwnerVerdict } from "./dance-owner-api";
import { danceOwnerFixture as f, danceOwnerFixtureReceipt, danceOwnerScope as scope } from "./dance-owner.fixtures";
beforeEach(establishSessionAuthority); afterEach(forgetSessionAuthority);
const unverified = { state: "unverified" } as const;
const me = { id: scope.accountId, object: "user", verification_state: "unverified", created: 1788495833, verification_capabilities: { unique_human: unverified, age_over_18: unverified, minimum_age: unverified, nationality: unverified, gender: unverified, wallet_score: unverified } } satisfies GetUsersMeResponse;
const body: DanceOwnerVerdict = { version: "dance-owner-verdict-attestation-v1", operation: "verdict", idempotency_key: "original", community_id: "community", review_id: "review", expected_review_revision: 3, verdict: "passed" };
const signal = () => new AbortController().signal;
function setup() {
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    return Response.json(path.endsWith("/users/me") ? me : path.endsWith("/rubric") ? f.rubric : path.endsWith("/verdict") ? danceOwnerFixtureReceipt(body) : path.endsWith("/media-access") ? { version: "dance-private-media-access-v1", lease_id: "lease", url: "/api/communities/community/dance/reviews/review/media/lease", expires_at_ms: Date.now() + 60_000 } : path.endsWith("/owner-reviews") ? { object: "dance_owner_review_page", items: [f.detail.review], next_cursor: null } : f.detail);
  });
  const client = createSessionApiClient({ origin: "https://pirate.sc", fetchImpl }); return { fetchImpl, client, api: createDanceOwnerApi(client, () => "fresh-csrf") };
}
test("real owner detail and rubric are bound between account reads without a Palm requirement", async () => {
  const h = setup(); expect(await h.api.detail(scope, signal())).toEqual(f);
  expect(h.fetchImpl.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual(["/api/users/me", "/api/communities/community/dance/owner-reviews/review", "/api/communities/community/dance/owner-reviews/review/rubric", "/api/users/me"]);
});
test("the generated verdict carries only the versioned decision, same-origin cookies and fresh CSRF", async () => {
  const h = setup(), abort = signal(); await h.api.verdict(scope, body, abort); const init = h.fetchImpl.mock.calls[1]![1]!;
  expect(JSON.parse(String(init.body))).toEqual(body); expect(new Headers(init.headers).get("x-csrf-token")).toBe("fresh-csrf");
  expect(h.fetchImpl.mock.calls.every(([, v]) => v?.credentials === "same-origin" && v.signal === abort && !new Headers(v.headers).has("authorization"))).toBe(true);
});
test("queue pagination keeps the exact opaque cursor and community", async () => {
  const h = setup(); await h.api.queue(scope, "a".repeat(64), signal()); const url = new URL(String(h.fetchImpl.mock.calls[1]![0])); expect(url.searchParams.get("cursor")).toBe("a".repeat(64));
});
test("owner preview requests the bound review revision and owner audience", async () => {
  const h = setup(); await h.api.media(scope, f, signal()); expect(JSON.parse(String(h.fetchImpl.mock.calls[1]![1]?.body))).toEqual({ version: "dance-private-media-access-v1", expected_review_revision: 3, audience: "owner" });
});
test("account replacement before verdict prevents dispatch", async () => {
  const h = setup(); h.fetchImpl.mockResolvedValueOnce(Response.json({ ...me, id: "replacement" })); await expect(h.api.verdict(scope, body, signal())).rejects.toThrow("account_changed"); expect(h.fetchImpl).toHaveBeenCalledTimes(1);
});
test("account replacement after the response withholds the private projection", async () => {
  const h = setup(); h.fetchImpl.mockResolvedValueOnce(Response.json(me)).mockResolvedValueOnce(Response.json(f.detail)).mockResolvedValueOnce(Response.json(f.rubric)).mockResolvedValueOnce(Response.json({ ...me, id: "replacement" }));
  await expect(h.api.detail(scope, signal())).rejects.toThrow("account_changed");
});
test("revoked browser authority during a read cannot progress to rubric or verdict", async () => {
  const h = setup(); h.fetchImpl.mockImplementationOnce(async () => { refreshSessionAuthority(); return Response.json(me); }); await expect(h.api.detail(scope, signal())).rejects.toThrow("session_changed"); expect(h.fetchImpl).toHaveBeenCalledTimes(1);
});
test("missing CSRF refuses an owner decision before the effect", async () => {
  const h = setup(); await expect(createDanceOwnerApi(h.client, () => undefined).verdict(scope, body, signal())).rejects.toThrow("csrf_unavailable"); expect(h.fetchImpl).toHaveBeenCalledTimes(1);
});
test("server-denied owner access is propagated without a dancer-result fallback", async () => {
  const h = setup(); h.fetchImpl.mockResolvedValueOnce(Response.json(me)).mockResolvedValueOnce(Response.json({ code: "not_found", message: "Not found" }, { status: 404 }));
  await expect(h.api.detail(scope, signal())).rejects.toThrow(); expect(h.fetchImpl).toHaveBeenCalledTimes(2);
});
