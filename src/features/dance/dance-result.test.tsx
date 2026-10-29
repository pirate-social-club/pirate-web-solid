import { afterEach, expect, test, vi } from "vitest";
import { createRoot, createSignal, flush } from "solid-js";
import { render, type JSX } from "@solidjs/web";
import { ApiClientError, type GetUsersMeResponse } from "@pirate/api-client";
import { createSessionApiClient } from "../../api/client.ts";
import { refreshSession } from "../../api/session.ts";
import { assertDanceResult, createDanceResultApi, danceResultPath, danceResultPresentation, type DanceResult, type DanceResultApi } from "./dance-result-api.ts";
import { DanceResultPage } from "./dance-result-page.tsx";
import { danceResultFixtures as fixtures } from "./dance-result.fixture.ts";

// SAFETY: vitest.app selects the DOM renderer; the app config resolves its server overload.
const renderDom = render as (view: () => JSX.Element, host: HTMLElement) => void;
const unverified = { state: "unverified" } as const;
const me = { id: "participant", object: "user", verification_state: "unverified", created: 1788495833, verification_capabilities: { unique_human: unverified, age_over_18: unverified, minimum_age: unverified, nationality: unverified, gender: unverified, wallet_score: unverified } } as const satisfies GetUsersMeResponse;
const scope = { accountId: "participant", communityId: "community", reviewId: "review" };
const session = async () => ({ status: "authenticated", userId: "participant", personas: [] }) as const;
const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); document.body.replaceChildren(); });
function mount(view: () => JSX.Element) { const host = document.createElement("div"); document.body.appendChild(host); createRoot(dispose => { cleanups.push(dispose); renderDom(view, host); }); return host; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test.each([fixtures.passed, fixtures.notPassed])("new no-pose results require not_required for either verdict", result => {
  const noPose: DanceResult = { ...result, captured_policy: { ...result.captured_policy, version: "moderator-review-policy-v2" }, cue_attestation: "not_required" };
  expect(() => assertDanceResult(noPose, scope)).not.toThrow();
  expect(() => assertDanceResult({ ...noPose, cue_attestation: "affirmed" }, scope)).toThrow("projection_invalid");
  expect(() => assertDanceResult({ ...noPose, cue_attestation: "not_attested" }, scope)).toThrow("projection_invalid");
  expect(() => assertDanceResult({ ...result, cue_attestation: "not_required" }, scope)).toThrow("projection_invalid");
});

test("the generated private reader uses the exact same-origin route, cookies, cancellation and a fresh account check", async () => {
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => Response.json(String(input).endsWith("/users/me") ? me : fixtures.passed));
  const api = createDanceResultApi(createSessionApiClient({ origin: "https://pirate.sc", fetchImpl }));
  const signal = new AbortController().signal;
  expect(await api.read(scope, signal)).toEqual(fixtures.passed);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(String(fetchImpl.mock.calls[0]![0])).toBe("https://pirate.sc/api/communities/community/dance/reviews/review/result");
  const calls = fetchImpl.mock.calls;
  expect(calls[0]?.[1]?.signal).toBe(signal);
  expect(calls.every(([, init]) => init?.credentials === "same-origin" && init.method === "GET" && !new Headers(init.headers).has("authorization"))).toBe(true);
});

test.each([
  ["account changed", fixtures.passed, { ...me, id: "other-participant" }, "session_changed"],
  ["foreign review", { ...fixtures.passed, review_id: "foreign" }, me, "target_mismatch"],
  ["foreign community", { ...fixtures.passed, community_id: "foreign" }, me, "target_mismatch"],
  ["uncommitted qualification", { ...fixtures.awaiting, qualification_ref: "uncommitted" }, me, "projection_invalid"],
  ["contradictory verdict", { ...fixtures.notPassed, cue_attestation: "affirmed" }, me, "projection_invalid"],
] as const)("the real reader refuses %s without exposing a private result", async (_name, result, account, reason) => {
  const api = createDanceResultApi(createSessionApiClient({ origin: "https://pirate.sc", fetchImpl: async input => Response.json(String(input).endsWith("/users/me") ? account : result) }));
  await expect(api.read(scope, new AbortController().signal)).rejects.toThrow(reason);
});

test.each([
  { ...fixtures.passed, score_bps: 10_000 },
  { ...fixtures.passed, raw_media_url: "https://untrusted.invalid/private.mp4" },
  { ...fixtures.passed, reviewer_account_id: "private-reviewer" },
])("the genuine closed response decoder refuses synthetic scores and private extensions", async result => {
  const fetchImpl = vi.fn(async () => Response.json(result));
  const api = createDanceResultApi(createSessionApiClient({ origin: "https://pirate.sc", fetchImpl }));
  await expect(api.read(scope, new AbortController().signal)).rejects.toThrow();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("result labels distinguish waiting, categorical pass, nonpass and expiry without promising winnings", () => {
  expect(danceResultPresentation(fixtures.awaiting).title).toBe("Waiting for review");
  expect(danceResultPresentation(fixtures.passed).title).toBe("Passed");
  expect(danceResultPresentation(fixtures.notPassed).title).toBe("Not passed");
  expect(danceResultPresentation(fixtures.reviewExpired).title).toBe("Not reviewed");
  expect(danceResultPresentation(fixtures.withdrawn).title).toBe("Withdrawn");
  expect(danceResultPresentation({ ...fixtures.passed, qualification_ref: null }).detail).not.toContain("qualifying");
  expect(JSON.stringify(danceResultPresentation(fixtures.passed))).not.toMatch(/score|win|ticket|10000|100%/iu);
});

test("anonymous entry performs no private read", async () => {
  const read = vi.fn();
  const host = mount(() => <DanceResultPage {...scope} api={{ read }} session={async () => "anonymous"} />);
  await vi.waitFor(() => expect(host.textContent).toContain("Sign in to view"));
  expect(read).not.toHaveBeenCalled();
  expect(host.querySelector("a")?.getAttribute("href")).toContain(encodeURIComponent(danceResultPath(scope.communityId, scope.reviewId)));
});

test("the real page displays a committed categorical result and the separate song link", async () => {
  const host = mount(() => <DanceResultPage {...scope} api={{ read: async () => fixtures.passed }} session={session} />);
  await vi.waitFor(() => expect(host.textContent).toContain("Passed"));
  expect(host.textContent).toContain("Your qualifying dance has been recorded.");
  expect(host.querySelector('a[href="/post/song"]')?.textContent).toBe("Back to song");
  expect(host.textContent).not.toMatch(/10000|score|3333333|qualification-v1|dancer|owner|win|ticket/iu);
});

test.each([fixtures.uploaded, fixtures.awaiting])("the private result links to the reachable recording-management page while editable", async result => {
  const host = mount(() => <DanceResultPage {...scope} api={{ read: async () => result }} session={session} />);
  await vi.waitFor(() => expect(host.querySelector('a[href="/dance/community/reviews/review/recording"]')).not.toBeNull());
});

test("page hiding aborts a pending result and ignores its late private data", async () => {
  const pending = deferred<DanceResult>(); let signal: AbortSignal | undefined;
  const api: DanceResultApi = { read: vi.fn((_scope, active) => { signal = active; return pending.promise; }) };
  const host = mount(() => <DanceResultPage {...scope} api={api} session={session} />);
  await vi.waitFor(() => expect(api.read).toHaveBeenCalledTimes(1));
  window.dispatchEvent(new Event("pagehide"));
  expect(signal?.aborted).toBe(true);
  pending.resolve(fixtures.passed);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(host.textContent).not.toContain("Passed");
  expect(host.querySelector("[data-dance-result]")?.getAttribute("data-dance-result")).toBe("loading");
});

test("session replacement clears a ready result before checking the new identity", async () => {
  let signedIn = true;
  const replacement = deferred<"anonymous">();
  const host = mount(() => <DanceResultPage {...scope} api={{ read: async () => fixtures.passed }} session={async () => signedIn ? session() : replacement.promise} />);
  await vi.waitFor(() => expect(host.textContent).toContain("Passed"));
  signedIn = false; refreshSession(); flush();
  expect(host.textContent).not.toContain("Passed");
  expect(host.textContent).toContain("Loading your dance result");
  replacement.resolve("anonymous");
  await vi.waitFor(() => expect(host.textContent).toContain("Sign in to view"));
});

test("a route change aborts the old target and cannot display its late result", async () => {
  const old = deferred<DanceResult>(); let firstSignal: AbortSignal | undefined;
  const api: DanceResultApi = { read: vi.fn((target, signal) => { if (target.reviewId === "review") { firstSignal = signal; return old.promise; } return Promise.resolve({ ...fixtures.awaiting, review_id: "next" }); }) };
  let change: () => void = () => {};
  const host = mount(() => { const [id, setId] = createSignal("review"); change = () => setId("next"); return <DanceResultPage communityId="community" reviewId={id()} api={api} session={session} />; });
  await vi.waitFor(() => expect(api.read).toHaveBeenCalledTimes(1));
  change(); await vi.waitFor(() => expect(host.textContent).toContain("Waiting for review"));
  expect(firstSignal?.aborted).toBe(true);
  old.resolve(fixtures.passed); await new Promise(resolve => setTimeout(resolve, 0));
  expect(host.textContent).not.toContain("Passed");
});

test("a declared inaccessible result exposes no private target or server error", async () => {
  const missing = new ApiClientError({ name: "NotFound", status: 404, code: "not_found", retryable: false }, { error: { code: "not_found", message: "Unavailable", retryable: false } });
  const host = mount(() => <DanceResultPage {...scope} api={{ read: async () => { throw missing; } }} session={session} />);
  await vi.waitFor(() => expect(host.textContent).toContain("This dance result is not available."));
  expect(host.textContent).not.toMatch(/reviewer|not_found|private-reviewer/iu);
});


test("a result arriving after unmount cannot write into a disposed page", async () => {
  const pending = deferred<DanceResult>(); let signal: AbortSignal | undefined;
  const api: DanceResultApi = { read: vi.fn((_scope, active) => { signal = active; return pending.promise; }) };
  const host = mount(() => <DanceResultPage {...scope} api={api} session={session} />);
  await vi.waitFor(() => expect(api.read).toHaveBeenCalledTimes(1));
  cleanups.pop()!();
  expect(signal?.aborted).toBe(true);
  const removed = host.textContent;
  pending.resolve(fixtures.passed); await new Promise(resolve => setTimeout(resolve, 0));
  expect(host.textContent).toBe(removed);
  expect(host.textContent).not.toContain("Passed");
});

test("refresh errors clear a previous private result and require an explicit retry", async () => {
  let failed = false;
  const api: DanceResultApi = { read: vi.fn(async () => { if (failed) throw new Error("private-provider-detail"); return fixtures.passed; }) };
  const host = mount(() => <DanceResultPage {...scope} api={api} session={session} />);
  await vi.waitFor(() => expect(host.textContent).toContain("Passed"));
  failed = true; refreshSession(); flush();
  expect(host.textContent).not.toContain("Passed");
  await vi.waitFor(() => expect(host.textContent).toContain("Your dance result could not be loaded."));
  expect(host.textContent).not.toContain("private-provider-detail");
  expect(api.read).toHaveBeenCalledTimes(2);
  failed = false; host.querySelector<HTMLButtonElement>("button")!.click();
  await vi.waitFor(() => expect(host.textContent).toContain("Passed"));
  expect(api.read).toHaveBeenCalledTimes(3);
});
