import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { GetUsersMeResponse } from "@pirate/api-client";
import { createSessionApiClient } from "../../api/client";
import { refreshSession } from "../../api/session";
import { establishSessionAuthority, forgetSessionAuthority } from "../../api/browser-session-events";
import { createDanceReviewApi, type DanceReviewCommand } from "./dance-review-api";
import { dancePreparationFixture } from "./dance-preparation.fixture";
import { danceReviewFixtureReceipt, danceReviewFixtures as f, danceReviewScope as scope } from "./dance-review.fixtures";
beforeEach(establishSessionAuthority);
afterEach(forgetSessionAuthority);

const unverified = { state: "unverified" } as const;
const me = { id: scope.accountId, object: "user", verification_state: "unverified", created: 1788495833,
  verification_capabilities: { unique_human: unverified, age_over_18: unverified, minimum_age: unverified, nationality: unverified, gender: unverified, wallet_score: unverified } } satisfies GetUsersMeResponse;
const body: DanceReviewCommand = { version: "dance-review-submit-v1", operation: "submit", idempotency_key: "original-command", community_id: scope.communityId, review_id: scope.reviewId,
  expected_review_revision: 1, show_publicly_if_passed: true, publication_disclosure_version: "disclosure-v1" };
const context = { ...dancePreparationFixture, session: { ...dancePreparationFixture.session,
  review_id: f.uploaded.review_id, session_id: f.uploaded.session_id, attempt_id: f.uploaded.attempt_id,
  community_id: f.uploaded.community_id, song_post_id: f.uploaded.song_post_id, terms_hash: f.uploaded.session_terms_hash,
  retention_hash: f.uploaded.captured_policy.retention_hash, safety_hash: f.uploaded.captured_policy.safety_hash },
  captured_policy: { ...dancePreparationFixture.captured_policy,
    qualification_policy_version_id: f.uploaded.qualification_policy_version, qualification_policy_hash: f.uploaded.qualification_policy_hash,
    rubric_version: f.uploaded.captured_policy.rubric_version, rubric_hash: f.uploaded.captured_policy.rubric_hash } };
function setup(reply: object, identity = me) {
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => Response.json(String(input).endsWith("/users/me") ? identity : reply));
  return { fetchImpl, api: createDanceReviewApi(createSessionApiClient({ origin: "https://pirate.sc", fetchImpl }), () => "fresh-csrf") };
}
const signal = () => new AbortController().signal;

const membership = { object: "account_community_membership", community_id: scope.communityId, display_name: "Community", resource_href: null, canonical_route: null, membership_status: "member", can_post: true } as const;
const joinEligibility = { community: scope.communityId, membership_mode: "gated", human_verification_lane: "very", joinable_now: false, status: "verification_required", membership_gate_summaries: [],
  next_action: { kind: "start_verification", provider_id: "very.web", intent_id: "join-intent" } } as const;

test("posting preflight walks the validated can_post projection with cookies, cancellation and same-account proof", async () => {
  const s = setup({}), abort = signal();
  s.fetchImpl.mockImplementation(async (input, _init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/users/me")) return Response.json(me);
    return Response.json({ object: "account_community_membership_page", items: url.searchParams.has("cursor") ? [membership] : [], next_cursor: url.searchParams.has("cursor") ? null : "next" });
  });
  expect(await s.api.postingEligibility(scope, abort)).toEqual({ kind: "eligible" });
  expect(s.fetchImpl.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual(["/api/users/me", "/api/users/me/community-memberships", "/api/users/me/community-memberships", "/api/users/me"]);
  expect(s.fetchImpl.mock.calls.every(([, init]) => init?.credentials === "same-origin" && init.signal === abort && !new Headers(init.headers).has("authorization"))).toBe(true);
});

test("a nonmember gets the exact gated community verification action without join or provider mutations", async () => {
  const s = setup({}); s.fetchImpl.mockImplementation(async (input, _init) => {
    const path = new URL(String(input)).pathname;
    return Response.json(path.endsWith("/users/me") ? me : path.endsWith("/community-memberships") ? { object: "account_community_membership_page", items: [], next_cursor: null } : joinEligibility);
  });
  expect(await s.api.postingEligibility(scope, signal())).toEqual({ kind: "unavailable", join: { kind: "verify", providerId: "very.web", intentId: "join-intent" } });
  expect(s.fetchImpl.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
  expect(String(s.fetchImpl.mock.calls[2]![0])).toContain("/communities/community/join-eligibility");
});

test.each(["foreign-account", "malformed-projection", "foreign-community", "network", "aborted"])("posting access remains unknown after %s", async failure => {
  const s = setup({}), abort = new AbortController(); let identities = 0;
  s.fetchImpl.mockImplementation(async (input, _init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/users/me")) { identities++; return Response.json(failure === "foreign-account" && identities === 2 ? { ...me, id: "other" } : me); }
    if (failure === "network") throw new TypeError("network_failed");
    if (failure === "aborted") abort.abort();
    if (path.endsWith("/community-memberships")) return Response.json({ object: "account_community_membership_page", items: failure === "malformed-projection" ? [{ ...membership, can_post: false }] : [], next_cursor: null });
    return Response.json(failure === "foreign-community" ? { ...joinEligibility, community: "other" } : joinEligibility);
  });
  await expect(s.api.postingEligibility(scope, abort.signal)).rejects.toThrow();
});

test("real generated Submit carries the actual boolean, fresh CSRF, cookies and cancellation between two identity reads", async () => {
  const s = setup(danceReviewFixtureReceipt(body, f.awaiting)), abort = signal();
  await s.api.command(scope, body, abort);
  const calls = s.fetchImpl.mock.calls;
  expect(calls.map(([url]) => new URL(String(url)).pathname)).toEqual(["/api/users/me", "/api/communities/community/dance/reviews/review/submit", "/api/users/me"]);
  const init = calls[1]![1]!;
  expect(init.method).toBe("POST"); expect(JSON.parse(String(init.body))).toEqual(body); expect(new Headers(init.headers).get("x-csrf-token")).toBe("fresh-csrf");
  expect(calls.every(([, init]) => init?.credentials === "same-origin" && init.signal === abort && !new Headers(init.headers).has("authorization"))).toBe(true);
});

test("a current review read is decoded and account checked on both sides", async () => {
  const s = setup(f.awaiting); expect(await s.api.read(scope, signal())).toEqual(f.awaiting); expect(s.fetchImpl).toHaveBeenCalledTimes(3);
});

test("a different account before dispatch cannot send any command", async () => {
  const s = setup(danceReviewFixtureReceipt(body, f.awaiting), { ...me, id: "another" });
  await expect(s.api.command(scope, body, signal())).rejects.toThrow("account_changed"); expect(s.fetchImpl).toHaveBeenCalledTimes(1);
});

test("account replacement after dispatch cannot expose the receipt", async () => {
  const s = setup(danceReviewFixtureReceipt(body, f.awaiting));
  s.fetchImpl.mockImplementationOnce(async () => Response.json(me)).mockImplementationOnce(async () => Response.json(danceReviewFixtureReceipt(body, f.awaiting)))
    .mockImplementationOnce(async () => Response.json({ ...me, id: "replacement" }));
  await expect(s.api.command(scope, body, signal())).rejects.toThrow("account_changed");
});

test("session revocation during an identity read stops the effect", async () => {
  const s = setup(f.awaiting); s.fetchImpl.mockImplementationOnce(async () => { refreshSession(); return Response.json(me); });
  await expect(s.api.read(scope, signal())).rejects.toThrow("session_changed"); expect(s.fetchImpl).toHaveBeenCalledTimes(1);
});

test("missing CSRF refuses before dispatch", async () => {
  const s = setup(f.awaiting), api = createDanceReviewApi(createSessionApiClient({ origin: "https://pirate.sc", fetchImpl: s.fetchImpl }), () => undefined);
  await expect(api.command(scope, body, signal())).rejects.toThrow("csrf_unavailable"); expect(s.fetchImpl).toHaveBeenCalledTimes(1);
});

test.each([
  { ...danceReviewFixtureReceipt(body, f.awaiting), operation: "withdraw" },
  { ...danceReviewFixtureReceipt(body, f.awaiting), review_id: "foreign" },
  { ...danceReviewFixtureReceipt(body, f.awaiting), outcome: "refused", refusal_code: null },
  { ...danceReviewFixtureReceipt(body, f.awaiting), result: { ...f.awaiting, score_bps: 10_000 } },
])("inconsistent or extended command receipts cannot advance the workflow", async receipt => {
  await expect(setup(receipt).api.command(scope, body, signal())).rejects.toThrow();
});

test("Submit obtains the frozen disclosure from its exact session and policy", async () => {
  const s = setup(context); expect(await s.api.disclosure(scope, f.uploaded, signal())).toBe(context.captured_policy.publication_disclosure_version);
  expect(String(s.fetchImpl.mock.calls[1]![0])).toContain("/dance/moderated-sessions/session/capture-context");
});

test.each([
  { ...context, session: { ...context.session, terms_hash: "a".repeat(64) } },
  { ...context, session: { ...context.session, review_id: "foreign" } },
  { ...context, captured_policy: { ...context.captured_policy, rubric_hash: "a".repeat(64) } },
])("a substituted capture context cannot supply publication authority", async value => {
  await expect(setup(value).api.disclosure(scope, f.uploaded, signal())).rejects.toThrow();
});

test("private preview requests only a dancer lease for the displayed review revision", async () => {
  const grant = { version: "dance-private-media-access-v1", lease_id: "lease", expires_at_ms: Date.now() + 30_000, url: "/api/communities/community/dance/reviews/review/media/lease" };
  const s = setup(grant); expect(await s.api.media(scope, f.awaiting, signal())).toEqual(grant);
  expect(JSON.parse(String(s.fetchImpl.mock.calls[1]![1]?.body))).toEqual({ version: "dance-private-media-access-v1", expected_review_revision: 3, audience: "dancer" });
});

test.each(["https://untrusted.invalid/private", "/api/communities/other/dance/reviews/review/media/lease", "/api/communities/community/dance/reviews/review/media/lease?extra=1"])("preview refuses a substituted URL %s", async url => {
  await expect(setup({ version: "dance-private-media-access-v1", lease_id: "lease", expires_at_ms: Date.now() + 30_000, url }).api.media(scope, f.awaiting, signal())).rejects.toThrow("media_unavailable");
});
