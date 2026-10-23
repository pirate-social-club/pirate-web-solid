import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render as renderDom, type JSX } from "@solidjs/web";
import { createRoot, createSignal, flush } from "solid-js";
import { buildRouteTree, PageFileSystemRouter } from "filesystem-routing";
import type { AuthenticatedSession } from "../../api/session";
import type { createCommunityProfileAttempt } from "../identity/community-profile-attempt";
import { resolve } from "node:path";
import { establishSessionAuthority, forgetSessionAuthority, replaceSessionAuthority } from "../../api/browser-session-events";
import { VideoPlaybackSeamsContext } from "../posts/video-submission/video-playback-seams";
import { DanceReferencePage } from "./dance-reference-page";
import { createDanceReferenceController, danceReferenceJournalKey } from "./dance-reference-controller";
import { createDanceReferenceFixtureApi, danceReferenceSession as session, danceReferenceStatus, danceReferenceTarget as target } from "./dance-reference.fixtures";
import { createDanceReviewFixtureStore } from "./dance-review.fixtures";

const cleanups: (() => void)[] = [];
beforeEach(() => { establishSessionAuthority(); vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {}); vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {}); });
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); document.body.replaceChildren(); forgetSessionAuthority(); vi.restoreAllMocks(); });
function mount(view: () => JSX.Element) {
  const host = document.createElement("div"); document.body.appendChild(host);
  createRoot(dispose => { cleanups.push(dispose); renderDom(() => <VideoPlaybackSeamsContext value={{ posterPath: () => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }}>{view()}</VideoPlaybackSeamsContext>, host); }); return host;
}
function button(host: HTMLElement, label: string) { const element = [...host.querySelectorAll("button")].find(v => v.textContent === label); expect(element).toBeDefined(); return element!; }
function harness() {
  const { store, entries } = createDanceReviewFixtureStore(), api = createDanceReferenceFixtureApi();
  const create = vi.spyOn(api, "create"), read = vi.spyOn(api, "status"), readTarget = vi.spyOn(api, "target");
  const resolveSession = async () => { establishSessionAuthority(); return session; };
  const start = () => mount(() => <DanceReferencePage referencePostId={target.scope.referencePostId} api={api} store={store} session={resolveSession} />);
  return { api, create, read, readTarget, entries, store, start };
}

test("the filesystem router exposes a separate reference-authoring leaf", async () => {
  const router = new PageFileSystemRouter({ dir: resolve("src/routes"), extensions: ["js", "jsx", "ts", "tsx"] });
  const route = buildRouteTree(await router.getRoutes()).find(v => v.path === "/dance/new/:referencePostId/");
  expect(route?.page).toBe(true); expect(route?.children).toBeUndefined();
});
test("the actual page previews the owned video and uses the song-community profile only after explicit Create", async () => {
  const h = harness(), host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain(target.songTitle));
  expect(host.textContent).toContain("Song profile"); expect(host.textContent).not.toContain("Video profile"); expect(h.create).not.toHaveBeenCalled();
  button(host, "Create dance").click(); await vi.waitFor(() => expect(host.textContent).toContain("Preparing your dance"));
  expect(h.create).toHaveBeenCalledOnce(); expect(h.create.mock.calls[0]![0]).toEqual(target.scope); expect(h.create.mock.calls[0]![1].persona_id).toBe("song-persona");
  button(host, "Check progress").click(); await vi.waitFor(() => expect(h.read).toHaveBeenCalledTimes(2)); expect(h.create).toHaveBeenCalledOnce();
});
test("a lost creation acknowledgement is retained across the actual error and Check again flow", async () => {
  const h = harness(); h.create.mockRejectedValueOnce(new Error("accepted_reply_lost")); const host = h.start();
  await vi.waitFor(() => expect(host.textContent).toContain(target.songTitle)); button(host, "Create dance").click();
  await vi.waitFor(() => expect(host.querySelector('[role="alert"]')).not.toBeNull()); const original = [...h.entries.values()][0];
  button(host, "Check again").click(); await vi.waitFor(() => expect(host.textContent).toContain("We couldn’t confirm"));
  expect(h.create).toHaveBeenCalledOnce(); expect(host.textContent).not.toContain("Choose profile");
  button(host, "Check request").click(); await vi.waitFor(() => expect(host.textContent).toContain("Preparing your dance"));
  expect(h.create.mock.calls[0]![1]).toEqual(h.create.mock.calls[1]![1]); expect(JSON.parse(original!).bodyJson).toBe(JSON.stringify(h.create.mock.calls[0]![1]));
});
test("a known prepared result links to the original song's Dance page", async () => {
  const h = harness(); h.read.mockResolvedValue({ ...danceReferenceStatus, status: "ready" }); const host = h.start();
  await vi.waitFor(() => expect(host.textContent).toContain(target.songTitle)); button(host, "Create dance").click();
  await vi.waitFor(() => expect(host.querySelector('a[href="/dance/song-community/songs/song-post"]')).not.toBeNull());
  expect(host.textContent).toContain("Your dance is prepared"); expect(host.textContent).not.toMatch(/reward|winnings|qualification|Claim/u);
});
test("unplayable delivery and missing exact-community profile cannot authorize creation", async () => {
  const h = harness(); h.readTarget.mockResolvedValue({ ...target, playable: false, delivery: { playback: "pending", thumbnail: "pending" } }); const host = h.start();
  await vi.waitFor(() => expect(host.textContent).toContain("isn’t playable")); expect(button(host, "Create dance").disabled).toBe(true); expect(h.create).not.toHaveBeenCalled();
});
test("a missing song-community profile uses the existing preparation path, then waits for another explicit Create", async () => {
  const h = harness(); let current: AuthenticatedSession = { ...session, personas: session.personas.filter(p => p.personaId !== "song-persona") };
  const prepare = vi.fn<ReturnType<typeof createCommunityProfileAttempt>>(async () => { current = session; return session.personas.find(p => p.personaId === "song-persona")!; });
  const host = mount(() => <DanceReferencePage referencePostId={target.scope.referencePostId} api={h.api} store={h.store} session={async () => { establishSessionAuthority(); return current; }} prepareProfile={prepare} />);
  await vi.waitFor(() => expect(host.textContent).toContain(target.songTitle)); expect(button(host, "Create dance").disabled).toBe(true);
  button(host, "Choose profile").click(); await vi.waitFor(() => expect(document.body.textContent).toContain("Create a new profile"));
  const option = document.querySelector<HTMLInputElement>('input[type="radio"][value="__create_new_persona__"]'); expect(option).not.toBeNull(); option!.click();
  await vi.waitFor(() => expect(host.textContent).toContain("Song profile")); expect(prepare.mock.calls[0]![0]).toMatchObject({ communityId: "song-community", choice: { kind: "create_new" } });
  expect(h.create).not.toHaveBeenCalled();
});
test("a route replacement discards late target content without writing a command", async () => {
  const h = harness(); let finish!: (value: typeof target) => void; h.readTarget.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  let change!: (v: string) => void; const host = mount(() => { const [id, setId] = createSignal(target.scope.referencePostId); change = setId; return <DanceReferencePage referencePostId={id()} api={h.api} store={h.store} session={async () => session} />; });
  await vi.waitFor(() => expect(h.readTarget).toHaveBeenCalledOnce()); change("other-video"); flush(); finish(target);
  await vi.waitFor(() => expect(host.querySelector('[role="alert"]')).not.toBeNull()); expect(host.textContent).not.toContain(target.songTitle); expect(h.entries.size).toBe(0); expect(h.create).not.toHaveBeenCalled();
});
test("pagehide clears the private target and late replies cannot restore it", async () => {
  const h = harness(), host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain(target.songTitle));
  window.dispatchEvent(new Event("pagehide")); flush(); expect(host.textContent).not.toContain("Song profile"); expect(host.textContent).not.toContain(target.songTitle);
  expect(h.entries.has(danceReferenceJournalKey({ accountId: session.userId, referencePostId: target.scope.referencePostId }))).toBe(false); expect(h.create).not.toHaveBeenCalled();
});
test("session replacement while Create is pending preserves the original journal and hides late success", async () => {
  const h = harness(); let finish!: (value: typeof danceReferenceStatus) => void; h.create.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const host = h.start(); await vi.waitFor(() => expect(host.textContent).toContain(target.songTitle)); button(host, "Create dance").click();
  await vi.waitFor(() => expect(h.create).toHaveBeenCalledOnce()); replaceSessionAuthority(); finish({ ...danceReferenceStatus, status: "ready" });
  await vi.waitFor(() => expect(host.textContent).not.toContain("Preparing your dance")); expect(host.textContent).not.toContain("Your dance is prepared");
  expect(h.entries.size).toBe(1); expect(JSON.parse([...h.entries.values()][0]!).choreographyId).toBeNull();
});


test("a retained original remains checkable when the current persona list is temporarily unavailable", async () => {
  const h = harness(), locator = { accountId: session.userId, referencePostId: target.scope.referencePostId };
  await createDanceReferenceController({ locator, currentLocator: () => locator, api: h.api, store: h.store }).create(target, "song-persona", new AbortController().signal);
  h.create.mockClear(); h.read.mockClear();
  const host = mount(() => <DanceReferencePage referencePostId={locator.referencePostId} api={h.api} store={h.store} session={async () => ({ ...session, personas: [], personasUnavailable: true })} />);
  await vi.waitFor(() => expect(host.textContent).toContain("Preparing your dance")); expect(h.create).not.toHaveBeenCalled(); expect(h.read).toHaveBeenCalledOnce();
});
