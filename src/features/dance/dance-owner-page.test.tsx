import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createRoot, createSignal, flush } from "solid-js";
import { render, type JSX } from "@solidjs/web";
import { buildRouteTree, PageFileSystemRouter } from "filesystem-routing";
import { resolve } from "node:path";
import { establishSessionAuthority, forgetSessionAuthority } from "../../api/browser-session-events";
import { refreshSession } from "../../api/session";
import type { DanceOwnerApi, DanceOwnerQueue } from "./dance-owner-api";
import { DanceOwnerPage } from "./dance-owner-page";
import { danceOwnerFixture as f, danceOwnerFixtureReceipt, danceOwnerScope as scope } from "./dance-owner.fixtures";
import { createDanceReviewFixtureStore } from "./dance-review.fixtures";
// SAFETY: the app runner selects the DOM renderer; TypeScript sees the server overload.
const renderDom = render as (view: () => JSX.Element, host: HTMLElement) => void;
const cleanups: Array<() => void> = [];
const session = async () => { establishSessionAuthority(); return { status: "authenticated", userId: scope.accountId, personas: [] } as const; };
beforeEach(() => { establishSessionAuthority(); vi.spyOn(window, "scrollTo").mockImplementation(() => {}); vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {}); vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {}); });
afterEach(() => { for (const dispose of cleanups.splice(0)) dispose(); document.body.replaceChildren(); forgetSessionAuthority(); vi.restoreAllMocks(); });
function mount(view: () => JSX.Element) { const host = document.createElement("div"); document.body.appendChild(host); createRoot(dispose => { cleanups.push(dispose); renderDom(view, host); }); return host; }
function button(host: Pick<ParentNode, "querySelectorAll">, label: string) { const value = [...host.querySelectorAll("button")].find(v => v.textContent === label); expect(value).toBeDefined(); return value!; }
function harness() {
  const { store, entries } = createDanceReviewFixtureStore();
  const detail = vi.fn<DanceOwnerApi["detail"]>(async () => f), verdict = vi.fn<DanceOwnerApi["verdict"]>(async (_scope, body) => danceOwnerFixtureReceipt(body));
  const queue = vi.fn<DanceOwnerApi["queue"]>(async () => ({ object: "dance_owner_review_page", items: [f.detail.review], next_cursor: null }));
  const media = vi.fn<DanceOwnerApi["media"]>(async () => ({ version: "dance-private-media-access-v1", lease_id: "lease", url: "/api/communities/community/dance/reviews/review/media/lease", expires_at_ms: Date.now() + 30_000 }));
  const api: DanceOwnerApi = { queue, detail, verdict, media };
  const start = (reviewId: string | null = "review") => mount(() => <DanceOwnerPage communityId="community" reviewId={reviewId ?? undefined} api={api} store={store} session={session} />);
  return { start, api, store, entries, detail, verdict, queue, media };
}
test("owner queue and detail are separate reachable route leaves", async () => {
  const router = new PageFileSystemRouter({ dir: resolve("src/routes"), extensions: ["js", "jsx", "ts", "tsx"] });
  const routes = buildRouteTree(await router.getRoutes()).filter(route => route.path.startsWith("/dance/:communityId/owner-reviews"));
  expect(routes.map(v => ({ path: v.path, children: v.children }))).toEqual([{ path: "/dance/:communityId/owner-reviews/", children: undefined }, { path: "/dance/:communityId/owner-reviews/:reviewId", children: undefined }]);
});
test("the current owner's queue links to actual private review and contains no result/wallet history", async () => {
  const h = harness(), host = h.start(null); await vi.waitFor(() => expect(host.textContent).toContain("Review recording"));
  expect(host.querySelector('a[href="/dance/community/owner-reviews/review"]')).not.toBeNull(); expect(host.textContent).not.toMatch(/wallet|qualification|balance|owner-account/u); expect(h.detail).not.toHaveBeenCalled();
});
test("queue pagination preserves the original cursor on a failed page then retries", async () => {
  const h = harness(), page: DanceOwnerQueue = { object: "dance_owner_review_page", items: [f.detail.review], next_cursor: "a".repeat(64) };
  h.queue.mockResolvedValueOnce(page).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ...page, next_cursor: null, items: [{ ...f.detail.review, review_id: "second" }] });
  const host = h.start(null); await vi.waitFor(() => expect(host.textContent).toContain("More recordings")); button(host, "More recordings").click();
  await vi.waitFor(() => expect(host.textContent).toContain("couldn’t be loaded")); button(host, "More recordings").click();
  await vi.waitFor(() => expect(host.querySelectorAll("li")).toHaveLength(2)); expect(h.queue.mock.calls.map(v => v[1])).toEqual([null, page.next_cursor, page.next_cursor]);
});
test("owner detail shows the captured rubric and explicit Pass attestation without Palm or numeric grade", async () => {
  const h = harness(), host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain("What to review"));
  expect(host.textContent).toContain(f.rubric.rubric_text); expect(host.textContent).toContain("you confirm you inspected this recording"); expect(host.textContent).toContain("Hold your arms out to the sides");
  expect(host.textContent).not.toMatch(/Palm|7000|10000|verified cue|reward earned/u); button(host, "Pass").click();
  await vi.waitFor(() => expect(host.textContent).toContain("Decision recorded")); expect(h.verdict.mock.calls[0]![1].verdict).toBe("passed"); expect(host.querySelector("video")).toBeNull();
});
test("Not passed records only that categorical decision", async () => {
  const h = harness(), host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain("What to review")); button(host, "Not passed").click();
  await vi.waitFor(() => expect(host.textContent).toContain("Your Not passed decision was recorded")); expect(h.verdict.mock.calls[0]![1].verdict).toBe("not_passed"); expect(host.textContent).not.toContain("cue was missing");
});
test("unknown verdict hides all actionable controls and Check again replays identical bytes", async () => {
  const h = harness(); h.verdict.mockRejectedValueOnce(new Error("lost_reply")); const host = h.start();
  await vi.waitFor(() => expect(host.textContent).toContain("What to review")); button(host, "Pass").click(); await vi.waitFor(() => expect(host.textContent).toContain("couldn’t confirm"));
  expect(host.textContent).not.toContain("What to review"); expect(h.entries.size).toBe(1); const original = h.verdict.mock.calls[0]![1];
  button(host, "Check again").click(); await vi.waitFor(() => expect(host.textContent).toContain("Decision recorded")); expect(h.verdict.mock.calls[1]![1]).toEqual(original); expect(h.entries.size).toBe(0);
});
test("owner preview uses only the exact private lease and pagehide clears its media and controls", async () => {
  const h = harness(), host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain("What to review")); button(host, "Preview recording").click();
  await vi.waitFor(() => expect(host.querySelector('video[aria-label="Private dance recording"]')).not.toBeNull()); const video = host.querySelector<HTMLVideoElement>('video[aria-label="Private dance recording"]')!;
  expect(video.getAttribute("src")).toBe("/api/communities/community/dance/reviews/review/media/lease"); window.dispatchEvent(new Event("pagehide")); flush();
  expect(video.hasAttribute("src")).toBe(false); expect(host.textContent).not.toContain("What to review"); expect([...h.entries.values()].join()).not.toContain("/media/");
});
test("a foreign preview URL is never attached", async () => {
  const h = harness(); h.media.mockResolvedValueOnce({ version: "dance-private-media-access-v1", lease_id: "lease", url: "https://foreign.invalid/private", expires_at_ms: Date.now() + 60_000 });
  const host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain("What to review")); button(host, "Preview recording").click(); await vi.waitFor(() => expect(host.textContent).toContain("preview isn’t available")); expect(host.querySelector('video[aria-label="Private dance recording"]')).toBeNull();
});
test("an account change discovered at media issuance removes rubric and verdict actions", async () => {
  const h = harness(); h.media.mockRejectedValueOnce(new Error("dance_owner_account_changed")); const host = h.start();
  await vi.waitFor(() => expect(host.textContent).toContain("What to review")); button(host, "Preview recording").click(); await vi.waitFor(() => expect(host.textContent).toContain("couldn’t confirm")); expect(host.textContent).not.toContain(f.rubric.rubric_text); expect(h.verdict).not.toHaveBeenCalled();
});
test("late private media cannot attach after session invalidation", async () => {
  const h = harness(); let finish: ((value: Awaited<ReturnType<DanceOwnerApi["media"]>>) => void) | undefined;
  h.media.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); const host = h.start();
  await vi.waitFor(() => expect(host.textContent).toContain("What to review")); button(host, "Preview recording").click(); await vi.waitFor(() => expect(h.media).toHaveBeenCalled());
  h.detail.mockRejectedValue(new Error("unavailable")); refreshSession(); finish!({ version: "dance-private-media-access-v1", lease_id: "late", url: "/api/communities/community/dance/reviews/review/media/late", expires_at_ms: Date.now() + 30_000 });
  await vi.waitFor(() => expect(host.textContent).toContain("couldn’t confirm")); expect(host.querySelector('video[aria-label="Private dance recording"]')).toBeNull();
});
test("a changed route removes the prior captured rubric before its next detail resolves", async () => {
  const h = harness(); const [review, setReview] = createSignal("review");
  const host = mount(() => <DanceOwnerPage communityId="community" reviewId={review()} api={h.api} store={h.store} session={session} />);
  await vi.waitFor(() => expect(host.textContent).toContain("What to review")); h.detail.mockImplementationOnce(() => new Promise(() => {})); setReview("another"); flush();
  await vi.waitFor(() => expect(host.textContent).toContain("Checking review access")); expect(host.textContent).not.toContain(f.rubric.rubric_text);
});
test("an elapsed deadline removes media and both decision controls", async () => {
  const h = harness(); h.detail.mockResolvedValue({ ...f, detail: { ...f.detail, review: { ...f.detail.review, review_deadline: new Date(Date.now() - 1).toISOString() } } });
  const host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain("deadline has passed")); expect([...host.querySelectorAll("button")].some(v => v.textContent === "Pass")).toBe(false); expect(h.media).not.toHaveBeenCalled();
});
