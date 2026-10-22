import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createRoot, createSignal, flush } from "solid-js";
import { render, type JSX } from "@solidjs/web";
import { establishSessionAuthority, forgetSessionAuthority } from "../../api/browser-session-events";
import { refreshSession } from "../../api/session";
import type { DanceResult } from "./dance-result-api";
import type { DanceReviewApi, DanceReviewCommand, DanceReviewMedia } from "./dance-review-api";
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
  const api: DanceReviewApi = { read, command, disclosure, media };
  const start = () => mount(() => <DanceReviewPage communityId={scope.communityId} reviewId={scope.reviewId} api={api} store={store} session={session} />);
  return { api, read, command, media, entries, store, start, setResult: (value: DanceResult) => { result = value; } };
}

test("the actual Review page defaults public-on and submits its actual control without policy disclaimers", async () => {
  const h = harness(), host = h.start();
  await vi.waitFor(() => expect(host.textContent).toContain("Ready to submit"));
  expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(true);
  expect(host.textContent).not.toMatch(/Fictional|consent|retention|This recording will not|subject to posting/u);
  button(host, "Submit").click();
  await vi.waitFor(() => expect(host.textContent).toContain("Waiting for review"));
  expect(h.command.mock.calls[0]![1]).toMatchObject({ operation: "submit", show_publicly_if_passed: true });
  expect(host.querySelector('a[href="/post/song"]')?.textContent).toBe("Done");
});

test("public-off remains explicit at Submit and does not become public-on during recovery", async () => {
  const h = harness(), host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain("Ready to submit"));
  const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!; checkbox.checked = false; checkbox.dispatchEvent(new Event("change", { bubbles: true })); flush();
  button(host, "Submit").click(); await vi.waitFor(() => expect(h.command).toHaveBeenCalledTimes(1));
  expect(h.command.mock.calls[0]![1]).toMatchObject({ show_publicly_if_passed: false });
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

test("unknown Submit blocks new controls until Check again recovers the identical original", async () => {
  const h = harness(), original = h.command.getMockImplementation()!;
  h.command.mockImplementationOnce(async (scope, body, signal) => { await original(scope, body, signal); throw new Error("lost_reply"); });
  const host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain("Ready to submit"));
  button(host, "Submit").click(); await vi.waitFor(() => expect(host.textContent).toContain("couldn’t confirm"));
  expect(host.querySelector('input[type="checkbox"]')).toBeNull(); expect(h.entries.size).toBe(1);
  const first: DanceReviewCommand = h.command.mock.calls[0]![1];
  h.setResult(f.awaiting);
  h.command.mockImplementationOnce(async () => danceReviewFixtureReceipt(first, f.awaiting));
  button(host, "Check again").click(); await vi.waitFor(() => expect(host.textContent).toContain("Waiting for review"));
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
