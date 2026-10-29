import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ApiClientError } from "@pirate/api-client";
import { createRoot, createSignal, flush } from "solid-js";
import { render, type JSX } from "@solidjs/web";
import { establishSessionAuthority, forgetSessionAuthority } from "../../api/browser-session-events";
import { refreshSession } from "../../api/session";
import { createSessionApiClient } from "../../api/client";
import type { DanceResult } from "./dance-result-api";
import { createDanceReviewApi, DanceReviewAuthorityError, type DanceReviewApi, type DanceReviewCommand, type DanceReviewMedia } from "./dance-review-api";
import { DanceReviewPage } from "./dance-review-page";
import { createDanceReviewFixtureStore, danceReviewFixtureReceipt, danceReviewFixtures as f, danceReviewScope as scope } from "./dance-review.fixtures";

// SAFETY: the app runner selects the DOM renderer; TypeScript sees the server overload.
const renderDom = render as (view: () => JSX.Element, host: HTMLElement) => void;
const cleanups: Array<() => void> = [];
const session = async () => { establishSessionAuthority(); return { status: "authenticated", userId: scope.accountId, personas: [] } as const; };
beforeEach(() => { establishSessionAuthority(); vi.spyOn(window, "scrollTo").mockImplementation(() => {}); vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {}); vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {}); });
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); document.body.replaceChildren(); forgetSessionAuthority(); vi.restoreAllMocks(); });
function mount(view: () => JSX.Element) { const host = document.createElement("div"); document.body.appendChild(host); createRoot(dispose => { cleanups.push(dispose); renderDom(view, host); }); return host; }
function button(host: Pick<ParentNode, "querySelectorAll">, label: string) { const element = [...host.querySelectorAll("button")].find(value => value.textContent === label); expect(element).toBeDefined(); return element!; }
function harness(initial: DanceResult = f.uploaded) {
  let result = initial;
  const { entries, store } = createDanceReviewFixtureStore();
  const command = vi.fn<DanceReviewApi["command"]>(async (_scope, body) => {
    result = body.operation === "withdraw" ? f.withdrawn : { ...f.awaiting, review_revision: result.review_revision + 1,
      show_publicly_if_passed: body.show_publicly_if_passed, initial_submit_receipt: { ...f.awaiting.initial_submit_receipt, show_publicly_if_passed: body.show_publicly_if_passed } };
    return danceReviewFixtureReceipt(body, result);
  });
  const read = vi.fn(async () => result), disclosure = vi.fn(async () => "disclosure-v1");
  const media = vi.fn<DanceReviewApi["media"]>(async () => ({ version: "dance-private-media-access-v1", lease_id: "lease", expires_at_ms: Date.now() + 30_000, url: "/api/communities/community/dance/reviews/review/media/lease" }));
  const postingEligibility = vi.fn<DanceReviewApi["postingEligibility"]>(async () => ({ kind: "eligible" }));
  const api: DanceReviewApi = { read, command, disclosure, media, postingEligibility };
  const start = () => mount(() => <DanceReviewPage communityId={scope.communityId} reviewId={scope.reviewId} api={api} store={store} session={session} />);
  return { api, read, command, media, postingEligibility, entries, store, start, setResult: (value: DanceResult) => { result = value; } };
}

test("an eligible participant submits the actual public choice after current posting checks", async () => {
  const h = harness(), host = h.start();
  await vi.waitFor(() => expect(host.textContent).toContain("Ready to submit"));
  expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
  expect(host.textContent).not.toMatch(/Fictional|consent|retention|This recording will not|subject to posting/u);
  button(host, "Submit for review").click();
  await vi.waitFor(() => expect(host.textContent).toContain("Waiting for review"));
  expect(h.command.mock.calls[0]![1]).toMatchObject({ operation: "submit", show_publicly_if_passed: true });
  expect(host.querySelector('a[href="/post/song"]')?.textContent).toBe("Done");
});

test("public-off remains explicit at Submit and does not become public-on during recovery", async () => {
  const h = harness(), host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain("Ready to submit"));
  const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!; checkbox.checked = false; checkbox.dispatchEvent(new Event("change", { bubbles: true })); flush();
  button(host, "Submit for review").click(); await vi.waitFor(() => expect(h.command).toHaveBeenCalledTimes(1));
  expect(h.command.mock.calls[0]![1]).toMatchObject({ show_publicly_if_passed: false });
});

test.each(["join", "request", "verify", "pending", "blocked", "joined"] as const)("unavailable posting access (%s) explains the normal community path and preserves private Submit", async kind => {
  const h = harness();
  const join = kind === "verify" ? { kind, providerId: "very.web", intentId: "intent" } as const : kind === "blocked" ? { kind, reason: "banned" } as const : { kind };
  h.postingEligibility.mockResolvedValue({ kind: "unavailable", join });
  const host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain("submit privately"));
  expect(button(host, "Submit for review").disabled).toBe(true); expect(h.command).not.toHaveBeenCalled();
  const link = host.querySelector('a[href="/c/community"]'); expect(link).not.toBeNull();
  if (kind === "verify") expect(link?.textContent).toBe("Verify to join");
  const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  checkbox.checked = false; checkbox.dispatchEvent(new Event("change", { bubbles: true })); flush();
  expect(button(host, "Submit for review").disabled).toBe(false); button(host, "Submit for review").click();
  await vi.waitFor(() => expect(h.command).toHaveBeenCalledTimes(1));
  expect(h.command.mock.calls[0]![1]).toMatchObject({ operation: "submit", show_publicly_if_passed: false });
});

test("a slow or failed eligibility read never blocks private submission or preview", async () => {
  const h = harness(); let reject!: (reason: Error) => void;
  h.postingEligibility.mockImplementationOnce(async () => new Promise((_, no) => { reject = no; }));
  const host = h.start(); await vi.waitFor(() => expect(h.postingEligibility).toHaveBeenCalledTimes(1));
  expect(host.textContent).toContain("Checking public posting access"); expect(button(host, "Submit for review").disabled).toBe(true);
  button(host, "Preview recording").click(); await vi.waitFor(() => expect(h.media).toHaveBeenCalledTimes(1));
  reject(new Error("network")); await vi.waitFor(() => expect(host.textContent).toContain("couldn’t confirm public posting access"));
  const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  checkbox.checked = false; checkbox.dispatchEvent(new Event("change", { bubbles: true })); flush();
  button(host, "Submit for review").click(); await vi.waitFor(() => expect(h.command).toHaveBeenCalledTimes(1));
  expect(h.command.mock.calls[0]![1]).toMatchObject({ show_publicly_if_passed: false });
});

test.each(["load", "public-submit"])("a silent account replacement during eligibility %s removes private controls", async when => {
  const h = harness(), error = new DanceReviewAuthorityError("dance_review_account_changed");
  if (when === "load") h.postingEligibility.mockRejectedValueOnce(error);
  const host = h.start();
  if (when === "public-submit") {
    await vi.waitFor(() => expect(button(host, "Submit for review").disabled).toBe(false));
    h.postingEligibility.mockRejectedValueOnce(error); button(host, "Submit for review").click();
  }
  await vi.waitFor(() => expect(host.textContent).toContain("couldn’t confirm your recording"));
  expect(host.querySelector('input[type="checkbox"]')).toBeNull(); expect(h.command).not.toHaveBeenCalled(); expect(h.entries.size).toBe(0);
});

test.each(["load", "public-submit"])("AuthError during posting eligibility %s clears private preview and requires sign-in", async when => {
  const h = harness(); let reject!: (reason: Error) => void;
  if (when === "load") h.postingEligibility.mockImplementationOnce(async () => new Promise((_, no) => { reject = no; }));
  const host = h.start(); await vi.waitFor(() => expect(h.postingEligibility).toHaveBeenCalledTimes(1));
  button(host, "Preview recording").click(); await vi.waitFor(() => expect(host.querySelector("video")).not.toBeNull());
  const video = host.querySelector("video")!;
  const error = new ApiClientError({ name: "AuthError", status: 401, code: "auth_error", retryable: false }, { error: { code: "auth_error", message: "Sign in", retryable: false } });
  if (when === "load") reject(error);
  else { h.postingEligibility.mockRejectedValueOnce(error); button(host, "Submit for review").click(); }
  await vi.waitFor(() => expect(host.textContent).toContain("Sign in to view your recording"));
  expect(host.querySelector('input[type="checkbox"]')).toBeNull(); expect(host.querySelector("video")).toBeNull(); expect(video.getAttribute("src")).toBeNull();
  expect(h.command).not.toHaveBeenCalled(); expect(h.entries.size).toBe(0);
});

test("refresh after normal joining enables public Submit; the command still rechecks posting access", async () => {
  const h = harness(); h.postingEligibility.mockResolvedValueOnce({ kind: "unavailable", join: { kind: "join" } });
  const host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain("Join this community"));
  button(host, "Check posting access").click(); await vi.waitFor(() => expect(button(host, "Submit for review").disabled).toBe(false));
  button(host, "Submit for review").click(); await vi.waitFor(() => expect(h.command).toHaveBeenCalledTimes(1));
  expect(h.postingEligibility).toHaveBeenCalledTimes(4); // Initial, explicit refresh, new intent, pending view.
});

test("membership lost between page load and public Submit keeps the private choice usable without a new journal", async () => {
  const h = harness(), host = h.start(); await vi.waitFor(() => expect(button(host, "Submit for review").disabled).toBe(false));
  h.postingEligibility.mockResolvedValue({ kind: "unavailable", join: { kind: "verify", providerId: "very.web", intentId: "intent" } });
  button(host, "Submit for review").click(); await vi.waitFor(() => expect(host.textContent).toContain("Verify and join"));
  expect(h.command).not.toHaveBeenCalled(); expect(h.entries.size).toBe(0);
  const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  checkbox.checked = false; checkbox.dispatchEvent(new Event("change", { bubbles: true })); flush();
  button(host, "Submit for review").click(); await vi.waitFor(() => expect(h.command).toHaveBeenCalledTimes(1));
  expect(h.command.mock.calls[0]![1]).toMatchObject({ show_publicly_if_passed: false });
});

test.each(["member", "gated", "unknown"])("composed generated adapter and page preserve the %s participant’s actual public/private visibility choice", async access => {
  let result: DanceResult = { ...f.awaiting, show_publicly_if_passed: access !== "member" };
  const { store } = createDanceReviewFixtureStore(), writes: DanceReviewCommand[] = [];
  const unverified = { state: "unverified" };
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/users/me")) return Response.json({ object: "user", id: scope.accountId, created: 1, verification_state: "unverified",
      verification_capabilities: { unique_human: unverified, age_over_18: unverified, minimum_age: unverified, nationality: unverified, gender: unverified, wallet_score: unverified } });
    if (path.endsWith("/result")) return Response.json(result);
    if (path.endsWith("/community-memberships")) {
      if (access === "unknown") throw new TypeError("offline");
      return Response.json({ object: "account_community_membership_page", items: access === "member" ? [{ object: "account_community_membership", community_id: scope.communityId,
        display_name: "Community", resource_href: null, canonical_route: null, membership_status: "member", can_post: true }] : [], next_cursor: null });
    }
    if (path.endsWith("/join-eligibility")) return Response.json({ community: scope.communityId, membership_mode: "gated", human_verification_lane: "very", joinable_now: false,
      status: "verification_required", membership_gate_summaries: [], next_action: { kind: "start_verification", provider_id: "very.web", intent_id: "intent" } });
    if (path.endsWith("/visibility") && init?.method === "POST") {
      // SAFETY: this fixture receives only the generated client's serialized
      // visibility body; the operation is checked before projecting its receipt.
      const body = JSON.parse(String(init.body)) as DanceReviewCommand; writes.push(body);
      if (body.operation !== "visibility") throw new Error("unexpected_command");
      result = { ...result, review_revision: result.review_revision + 1, show_publicly_if_passed: body.show_publicly_if_passed };
      return Response.json(danceReviewFixtureReceipt(body, result));
    }
    throw new Error("unexpected_endpoint");
  });
  // This session resolves without rotating authority after the real adapter is created.
  const api = createDanceReviewApi(createSessionApiClient({ origin: "https://pirate.sc", fetchImpl }), () => "csrf");
  const host = mount(() => <DanceReviewPage communityId="community" reviewId="review" api={api} store={store} session={async () => ({ status: "authenticated", userId: scope.accountId, personas: [] })} />);
  await vi.waitFor(() => expect(host.textContent).toContain(access === "member" ? "Waiting for review" : access === "gated" ? "Verify and join" : "couldn’t confirm public posting access"));
  const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  checkbox.checked = access === "member"; checkbox.dispatchEvent(new Event("change", { bubbles: true })); flush();
  expect(button(host, "Save publication choice").disabled).toBe(false); button(host, "Save publication choice").click();
  await vi.waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({ operation: "visibility", show_publicly_if_passed: access === "member" });
  await vi.waitFor(() => expect(button(host, "Save publication choice").disabled).toBe(true));
});

test.each(["route", "session", "pagehide"])("late posting eligibility cannot restore public controls after %s changes", async change => {
  const h = harness(); let resolve!: (value: Awaited<ReturnType<DanceReviewApi["postingEligibility"]>>) => void;
  h.postingEligibility.mockImplementationOnce(async () => new Promise(done => { resolve = done; }));
  const [reviewId, setReviewId] = createSignal("review"); let signedIn = true;
  const host = mount(() => <DanceReviewPage communityId="community" reviewId={reviewId()} api={h.api} store={h.store} session={async () => signedIn ? session() : "anonymous"} />);
  await vi.waitFor(() => expect(h.postingEligibility).toHaveBeenCalledTimes(1));
  const pending = h.postingEligibility.mock.calls[0]![1];
  if (change === "route") setReviewId("different-review");
  else if (change === "session") { signedIn = false; refreshSession(); }
  else window.dispatchEvent(new Event("pagehide"));
  flush(); expect(pending.aborted).toBe(true); resolve({ kind: "eligible" });
  await new Promise(done => setTimeout(done, 0)); flush();
  expect(host.textContent).not.toContain("Posting access confirmed"); expect(h.command).not.toHaveBeenCalled();
});

test("pending review edits its current boolean through a confirmed command", async () => {
  const h = harness(f.awaiting), host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain("Waiting for review"));
  expect(button(host, "Save publication choice").disabled).toBe(true);
  const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!; checkbox.checked = true; checkbox.dispatchEvent(new Event("change", { bubbles: true })); flush();
  button(host, "Save publication choice").click();
  await vi.waitFor(() => expect(h.command).toHaveBeenCalledTimes(1));
  expect(h.command.mock.calls[0]![1]).toMatchObject({ operation: "visibility", show_publicly_if_passed: true });
  await vi.waitFor(() => expect(button(host, "Save publication choice").disabled).toBe(true));
});

test("unknown Submit keeps the screen and disables writes until explicit original-command recovery", async () => {
  const h = harness(), original = h.command.getMockImplementation()!;
  h.command.mockImplementationOnce(async (scope, body, signal) => { await original(scope, body, signal); throw new Error("lost_reply"); });
  const host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain("Ready to submit"));
  button(host, "Submit for review").click(); await vi.waitFor(() => expect(host.textContent).toContain("could not be confirmed"));
  expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(true); expect(h.entries.size).toBe(1);
  const first: DanceReviewCommand = h.command.mock.calls[0]![1];
  h.setResult(f.awaiting);
  h.command.mockImplementationOnce(async () => danceReviewFixtureReceipt(first, f.awaiting));
  button(host, "Resume submission").click(); await vi.waitFor(() => expect(host.textContent).toContain("Waiting for review"));
  expect(h.command.mock.calls[1]![1]).toEqual(first); expect(h.entries.size).toBe(0);
});

test("cancellation needs confirmation; Keep waiting sends no command", async () => {
  const h = harness(f.awaiting), host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain("Waiting for review"));
  button(host, "Cancel review").click(); await vi.waitFor(() => expect(document.body.textContent).toContain("Cancel review of this recording?"));
  button(document.body, "Keep waiting").click(); expect(h.command).not.toHaveBeenCalled(); expect(host.textContent).toContain("Waiting for review");
});

test("confirmed cancellation displays withdrawal and closes publication and preview controls", async () => {
  const h = harness(f.awaiting), host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain("Waiting for review"));
  button(host, "Cancel review").click();
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
  button(document.querySelector('[role="dialog"]')!, "Cancel review").click();
  await vi.waitFor(() => expect(host.textContent).toContain("Withdrawn"));
  expect(h.command.mock.calls[0]![1].operation).toBe("withdraw"); expect(host.querySelector('input[type="checkbox"]')).toBeNull(); expect(h.media).not.toHaveBeenCalled();
});

test("a verdict racing cancellation is shown without a false withdrawal", async () => {
  const h = harness(f.awaiting); h.command.mockImplementationOnce(async (_scope, body) => { h.setResult(f.passed); return danceReviewFixtureReceipt(body, f.passed, "review_closed"); });
  const host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain("Waiting for review"));
  button(host, "Cancel review").click(); await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull()); button(document.querySelector('[role="dialog"]')!, "Cancel review").click();
  await vi.waitFor(() => expect(host.textContent).toContain("Passed")); expect(host.textContent).not.toContain("Withdrawn"); expect(host.querySelector('input[type="checkbox"]')).toBeNull();
});

test("private preview is issued only on intent and page hiding removes it before late work", async () => {
  const h = harness(f.awaiting), host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain("Waiting for review")); expect(h.media).not.toHaveBeenCalled();
  button(host, "Preview recording").click(); await vi.waitFor(() => expect(host.querySelector("video")?.getAttribute("src")).toContain("/media/lease"));
  const video = host.querySelector("video")!; window.dispatchEvent(new Event("pagehide")); flush();
  expect(video.getAttribute("src")).toBeNull(); expect(host.querySelector("video")).toBeNull(); expect(host.textContent).not.toContain("Waiting for review");
});

test("route changes ignore a late grant for the previous private recording", async () => {
  const h = harness(f.awaiting); let resolve!: (value: DanceReviewMedia) => void;
  h.media.mockImplementationOnce(async () => new Promise(done => { resolve = done; }));
  const [reviewId, setReviewId] = createSignal("review");
  const host = mount(() => <DanceReviewPage communityId="community" reviewId={reviewId()} api={h.api} store={h.store} session={session} />);
  await vi.waitFor(() => expect(host.textContent).toContain("Waiting for review")); button(host, "Preview recording").click(); await vi.waitFor(() => expect(h.media).toHaveBeenCalledTimes(1));
  setReviewId("different-review"); flush(); resolve({ version: "dance-private-media-access-v1", lease_id: "lease", expires_at_ms: Date.now() + 30_000, url: "/api/communities/community/dance/reviews/review/media/lease" });
  await new Promise(done => setTimeout(done, 0)); expect(host.querySelector("video")).toBeNull();
});

test("an expired preview is removed and requires a fresh access intent", async () => {
  const h = harness(f.awaiting), host = h.start();
  h.media.mockImplementationOnce(async () => ({ version: "dance-private-media-access-v1", lease_id: "lease", expires_at_ms: Date.now() + 150, url: "/api/communities/community/dance/reviews/review/media/lease" }));
  await vi.waitFor(() => expect(host.textContent).toContain("Waiting for review")); button(host, "Preview recording").click();
  await vi.waitFor(() => expect(host.querySelector("video")).not.toBeNull());
  const video = host.querySelector("video")!;
  await vi.waitFor(() => expect(host.querySelector("video")).toBeNull()); expect(video.getAttribute("src")).toBeNull(); expect(h.media).toHaveBeenCalledTimes(1);
});

test("a foreign private preview URL never becomes a video source", async () => {
  const h = harness(f.awaiting), host = h.start();
  h.media.mockResolvedValueOnce({ version: "dance-private-media-access-v1", lease_id: "lease", expires_at_ms: Date.now() + 30_000, url: "https://foreign.invalid/video" });
  await vi.waitFor(() => expect(host.textContent).toContain("Waiting for review")); button(host, "Preview recording").click();
  await vi.waitFor(() => expect(host.textContent).toContain("preview isn’t available")); expect(host.querySelector("video")).toBeNull();
});

test("anonymous entry never opens the journal or reads private data", async () => {
  const h = harness(), host = mount(() => <DanceReviewPage communityId="community" reviewId="review" api={h.api} store={h.store} session={async () => "anonymous"} />);
  await vi.waitFor(() => expect(host.textContent).toContain("Sign in to view")); expect(h.read).not.toHaveBeenCalled(); expect(h.entries.size).toBe(0);
});

test("session replacement clears ready controls before the next account resolves", async () => {
  const h = harness(f.awaiting); let signedIn = true;
  const host = mount(() => <DanceReviewPage communityId="community" reviewId="review" api={h.api} store={h.store} session={async () => signedIn ? session() : "anonymous"} />);
  await vi.waitFor(() => expect(host.textContent).toContain("Waiting for review")); signedIn = false; refreshSession(); flush();
  expect(host.querySelector('input[type="checkbox"]')).toBeNull(); await vi.waitFor(() => expect(host.textContent).toContain("Sign in to view"));
});

test("pending review advances to its truthful verdict without a manual check or any command", async () => {
  vi.useFakeTimers();
  try {
    const h = harness(f.awaiting), host = h.start(); await vi.advanceTimersByTimeAsync(1); flush();
    expect(host.textContent).toContain("Waiting for review"); h.setResult(f.passed);
    await vi.advanceTimersByTimeAsync(3000); flush();
    expect(host.textContent).toContain("Passed"); expect(h.command).not.toHaveBeenCalled();
    const reads = h.read.mock.calls.length; await vi.advanceTimersByTimeAsync(20000); expect(h.read).toHaveBeenCalledTimes(reads);
  } finally { vi.useRealTimers(); }
});

test("visibility return resumes bounded read-only review observation", async () => {
  vi.useFakeTimers();
  try {
    const h = harness(f.awaiting), host = h.start(); await vi.advanceTimersByTimeAsync(1); flush();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden"); document.dispatchEvent(new Event("visibilitychange"));
    const reads = h.read.mock.calls.length; await vi.advanceTimersByTimeAsync(30000); expect(h.read).toHaveBeenCalledTimes(reads);
    h.setResult(f.passed); visibility.mockReturnValue("visible"); document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(1); flush();
    expect(host.textContent).toContain("Passed"); expect(h.command).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});

test("a nonmember can explicitly keep the take private and submit without joining or verification", async () => {
  const h = harness(); h.postingEligibility.mockResolvedValue({ kind: "unavailable", join: { kind: "join" } });
  const host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain("Keep this take private"));
  button(host, "Keep this take private").click(); flush();
  expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
  button(host, "Submit for review").click(); await vi.waitFor(() => expect(h.command).toHaveBeenCalledOnce());
  expect(h.command.mock.calls[0]![1]).toMatchObject({ operation: "submit", show_publicly_if_passed: false });
});
