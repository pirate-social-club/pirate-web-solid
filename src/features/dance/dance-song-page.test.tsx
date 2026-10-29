import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createRoot, createSignal, flush } from "solid-js";
import { render, type JSX } from "@solidjs/web";
import { establishSessionAuthority, forgetSessionAuthority } from "../../api/browser-session-events";
import { refreshSession } from "../../api/session";
import { DanceSongPage } from "./dance-song-page";
import { dancePreparationFixture } from "./dance-preparation.fixture";
import { createDanceCameraFixtureApi, danceCameraContext as context, danceCameraOptions as options, danceCameraScope as scope, danceCameraSession as session, danceCameraResult } from "./dance-camera.fixtures";
import { createDanceCameraReviewFixtureApi } from "./dance-camera.fixtures";
import type { createDanceRecorder } from "./dance-recorder";
import type { DanceRecorderView } from "./dance-recorder";
import type { AuthenticatedSession } from "../../api/session";
import type { DanceJournalStore } from "./dance-preparation-journal";
import { createCommunityProfileAttempt } from "../identity/community-profile-attempt";
import { VideoCaptureError } from "../posts/video-submission/capture-failure";
import { buildRouteTree, PageFileSystemRouter } from "filesystem-routing";
import { resolve } from "node:path";
import { VideoPlaybackSeamsContext } from "../posts/video-submission/video-playback-seams";
import { createGeneratedApiClient, readCsrfCookie } from "../../api/client";
import { SessionAuthorityChangedError } from "../../api/browser-auth-coordination";
// SAFETY: the DOM app runner supplies this renderer; TypeScript sees its SSR overload.
const renderDom = render as (view: () => JSX.Element, host: HTMLElement) => void;
const cleanups: Array<() => void> = [];
beforeEach(() => { establishSessionAuthority(); vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(); vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {}); vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {}); vi.spyOn(window, "scrollTo").mockImplementation(() => {}); });
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); document.body.replaceChildren(); forgetSessionAuthority(); vi.restoreAllMocks(); });
function mount(view: () => JSX.Element) { const host = document.createElement("div"); document.body.appendChild(host); createRoot(dispose => { cleanups.push(dispose); renderDom(() => <VideoPlaybackSeamsContext value={{ posterPath: () => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }}>{view()}</VideoPlaybackSeamsContext>, host); }); return host; }
function button(host: Pick<ParentNode, "querySelectorAll">, label: string) { const found = [...host.querySelectorAll("button")].find(value => value.textContent === label || value.getAttribute("aria-label") === label); expect(found).toBeDefined(); return found!; }
const authenticated = async () => { establishSessionAuthority(); return session; };

test("the actual filesystem router exposes the Dance entry as a leaf beside review routes", async () => {
  const router = new PageFileSystemRouter({ dir: resolve("src/routes"), extensions: ["js", "jsx", "ts", "tsx"] });
  const entry = buildRouteTree(await router.getRoutes()).find(route => route.path === "/dance/:communityId/songs/:postId/");
  expect(entry?.page).toBe(true); expect(entry?.children).toBeUndefined();
});
function harness() {
  const api = createDanceCameraFixtureApi(), owner = vi.spyOn(api, "owner"), readOptions = vi.spyOn(api, "options"), latest = vi.spyOn(api, "latest");
  const ready = { kind: "capture_ready" as const, session: { ...context.session, state: "consented" as const }, context: { ...context, session: { ...context.session, state: "consented" as const } }, assertCurrent: () => {} };
  const stop = vi.fn();
  const streamMethods: Pick<MediaStream, "getTracks"> = { getTracks: () => [] };
  // SAFETY: the DOM fixture uses only srcObject; native capture has a separate test layer.
  const stream = streamMethods as MediaStream;
  const prepare = vi.fn(async (): Promise<DanceRecorderView> => ({ kind: "objectives", session: context.session, context }));
  const enter = vi.fn<ReturnType<typeof createDanceRecorder>["enter"]>(async (): Promise<DanceRecorderView> => ({ kind: "camera", ready, stream }));
  const record = vi.fn<ReturnType<typeof createDanceRecorder>["record"]>(async (_signal, stage) => { stage("saving"); return { kind: "upload", upload: { kind: "processing", session: ready.session } }; });
  const recover = vi.fn(async (): Promise<DanceRecorderView> => ({ kind: "upload", upload: { kind: "review", session: { ...ready.session, state: "uploaded" } } }));
  const resume = vi.fn(async (): Promise<DanceRecorderView> => ({ kind: "upload", upload: { kind: "processing", session: ready.session } }));
  const dispose = vi.fn(stop), factory = vi.fn<typeof createDanceRecorder>(() => ({ prepare, enter, record, recover, resume, observe: recover, pause: dispose, localPreview: async () => null, dispose, newAttempt: prepare }));
  const store: DanceJournalStore = { read: () => null, write: () => {}, remove: () => {}, exclusive: async (_key, use) => use() };
  const reviewApi = createDanceCameraReviewFixtureApi();
  const start = () => mount(() => <DanceSongPage {...scope} api={api} session={authenticated} recorder={factory} store={store} reviewApi={reviewApi} />);
  const choose = async (host: HTMLElement) => { await vi.waitFor(() => expect(host.querySelector('[aria-label="Open dance 1"]')).not.toBeNull()); button(host, "Open dance 1").click(); await vi.waitFor(() => expect(host.textContent).toContain("Do this dance")); };
  return { api, owner, readOptions, latest, prepare, enter, record, recover, resume, dispose, factory, start, choose, stop, store };
}

test("the song's dance grid leads through reference and profile to the actual recording panel", async () => {
  const h = harness(), host = h.start(); await h.choose(host);
  expect(host.textContent).toContain("Dancer"); button(host, "Do this dance").click(); await vi.waitFor(() => expect(host.querySelector('[aria-label="Camera preview"]')).not.toBeNull());
  expect(host.querySelector('[aria-label="Selected dance"]')).toBeNull();
  expect(h.factory.mock.calls[0]![0].scope).toEqual(scope); expect(h.owner).toHaveBeenCalledTimes(2); expect(h.enter).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain("This session requires an opening cue");
  button(host, "Record").click();
  await vi.waitFor(() => expect(host.textContent).toContain("Ready to submit"));
  expect(host.textContent).not.toContain("This session requires an opening cue");
  expect(h.record).toHaveBeenCalledTimes(1); expect(h.recover).toHaveBeenCalledTimes(1);
  expect(host.textContent).not.toContain("Check recording"); expect(host.textContent).not.toContain("Review recording");
});

test("an existing saved original exposes recovery without opening a camera", async () => {
  const h = harness(); h.prepare.mockResolvedValueOnce({ kind: "recovery", session: context.session });
  const host = h.start(); await h.choose(host); button(host, "Do this dance").click();
  await vi.waitFor(() => expect(host.textContent).toContain("saved recording is ready")); expect(h.enter).not.toHaveBeenCalled();
  button(host, "Resume upload").click(); await vi.waitFor(() => expect(h.resume).toHaveBeenCalledTimes(1)); expect(h.enter).not.toHaveBeenCalled();
});

test("a recording/save failure shows recovery and never invokes a second Record", async () => {
  const h = harness(); h.record.mockRejectedValueOnce(new Error("unknown_save")); const host = h.start(); await h.choose(host); button(host, "Do this dance").click();
  await vi.waitFor(() => expect(host.querySelector('button[aria-label="Record"]')).not.toBeNull()); button(host, "Record").click();
  await vi.waitFor(() => expect(host.textContent).toContain("was interrupted")); button(host, "Resume recording").click();
  await vi.waitFor(() => expect(host.textContent).toContain("Ready to submit")); expect(h.record).toHaveBeenCalledTimes(1); expect(h.recover).toHaveBeenCalledTimes(1);
});

test("permission refusal explains browser access and preserves an explicit recovery path", async () => {
  const h = harness(); h.enter.mockRejectedValueOnce(new VideoCaptureError("camera_denied", "permission refused"));
  h.recover.mockResolvedValueOnce({ kind: "objectives", session: context.session, context });
  const host = h.start(); await h.choose(host); button(host, "Do this dance").click();
  await vi.waitFor(() => expect(host.textContent).toContain("Allow access in your browser")); expect(host.querySelector('[aria-label="Camera preview"]')).toBeNull();
  button(host, "Resume recording").click(); await vi.waitFor(() => expect(host.querySelector('[aria-label="Camera preview"]')).not.toBeNull()); expect(h.record).not.toHaveBeenCalled();
});

test("pending review links to its current recording and omits Do this dance", async () => {
  const h = harness(); h.latest.mockResolvedValueOnce({ object: "latest_moderated_dance_review", latest_submitted: danceCameraResult("awaiting"), active_session_id: context.session.session_id });
  const host = h.start(); await vi.waitFor(() => expect(host.querySelector('[aria-label="Open dance 1"]')).not.toBeNull()); button(host, "Open dance 1").click();
  await vi.waitFor(() => expect(host.textContent).toContain("Waiting for review")); expect(host.textContent).not.toContain("Do this dance"); expect(h.factory).not.toHaveBeenCalled();
});

test("a withdrawn latest recording stays hidden and allows the next explicit attempt", async () => {
  const h = harness(); h.latest.mockResolvedValueOnce({ object: "latest_moderated_dance_review", latest_submitted: danceCameraResult("withdrawn"), active_session_id: null });
  const host = h.start(); await h.choose(host); expect(host.textContent).not.toContain("Withdrawn"); expect(button(host, "Do this dance").disabled).toBe(false);
});

test("the owner cannot reach capture through the page", async () => {
  const h = harness(); h.owner.mockResolvedValue(true); const host = h.start();
  await vi.waitFor(() => expect(host.querySelector('[aria-label="Open dance 1"]')).not.toBeNull()); button(host, "Open dance 1").click();
  await vi.waitFor(() => expect(host.textContent).toContain("You review recordings")); expect(host.textContent).not.toContain("Do this dance"); expect(h.factory).not.toHaveBeenCalled();
});

test("ownership gained after page load is rechecked before camera entry", async () => {
  const h = harness(), host = h.start(); await h.choose(host); h.owner.mockResolvedValueOnce(true); button(host, "Do this dance").click();
  await vi.waitFor(() => expect(host.textContent).toContain("Recording isn’t available")); expect(h.factory).not.toHaveBeenCalled();
});

test("no active community profile requires selection rather than a global first profile", async () => {
  const h = harness(), other: AuthenticatedSession = { ...session, personas: [{ ...session.personas[0]!, communityBinding: { communityId: "elsewhere", bindingSource: "activity_participation" } }] };
  const host = mount(() => <DanceSongPage {...scope} api={h.api} recorder={h.factory} session={async () => other} />); await h.choose(host);
  expect(button(host, "Do this dance").disabled).toBe(true); expect(host.textContent).toContain("Choose profile"); expect(h.factory).not.toHaveBeenCalled();
});

test("an unbound profile is prepared explicitly and the next entry uses fresh active community authority", async () => {
  const h = harness(); let resolved: AuthenticatedSession = { ...session, personas: [{ ...session.personas[0]!, communityBinding: null }] };
  const prepareProfile = vi.fn<ReturnType<typeof createCommunityProfileAttempt>>(async input => { expect(input.choice).toEqual({ kind: "existing", personaId: "persona" }); resolved = session; return session.personas[0]!; });
  const host = mount(() => <DanceSongPage {...scope} api={h.api} recorder={h.factory} store={h.store} session={async () => resolved} prepareProfile={prepareProfile} />);
  await h.choose(host); button(host, "Choose profile").click();
  await vi.waitFor(() => expect(document.querySelector('input[type="radio"][value="persona"]')).not.toBeNull());
  document.querySelector<HTMLInputElement>('input[type="radio"][value="persona"]')!.click(); flush();
  await vi.waitFor(() => expect(prepareProfile).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(h.readOptions).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(host.querySelector("[data-dance-song]")?.getAttribute("data-dance-song")).toBe("ready"));
  await h.choose(host); expect(button(host, "Do this dance").disabled).toBe(false); button(host, "Do this dance").click();
  await vi.waitFor(() => expect(h.factory).toHaveBeenCalledTimes(1)); expect(h.factory.mock.calls[0]![0].scope.personaId).toBe("persona");
});

test("an unavailable policy keeps references visible but cannot begin capture", async () => {
  const h = harness(); h.readOptions.mockResolvedValueOnce({ ...options, ready: false, unavailable_code: "processor_unavailable" });
  const host = h.start(); await h.choose(host); expect(button(host, "Do this dance").disabled).toBe(true); expect(h.factory).not.toHaveBeenCalled();
});

test("a delayed context for another persona cannot enter a recording session", async () => {
  const h = harness(); h.latest.mockResolvedValueOnce({ object: "latest_moderated_dance_review", latest_submitted: null, active_session_id: context.session.session_id });
  vi.spyOn(h.api, "context").mockResolvedValueOnce({ ...context, persona_id: "foreign-persona" });
  const host = h.start(); await vi.waitFor(() => expect(host.querySelector('[aria-label="Open dance 1"]')).not.toBeNull()); button(host, "Open dance 1").click();
  await vi.waitFor(() => expect(host.textContent).toContain("couldn’t be loaded")); expect(host.textContent).not.toContain("Do this dance"); expect(h.factory).not.toHaveBeenCalled();
});

test("page hiding aborts active recording and ignores a late capture result", async () => {
  const h = harness(); let finish!: (view: DanceRecorderView) => void;
  h.record.mockImplementationOnce(async () => new Promise(done => { finish = done; }));
  const host = h.start(); await h.choose(host); button(host, "Do this dance").click(); await vi.waitFor(() => expect(host.querySelector('[aria-label="Camera preview"]')).not.toBeNull());
  button(host, "Record").click(); await vi.waitFor(() => expect(h.record).toHaveBeenCalledTimes(1)); window.dispatchEvent(new Event("pagehide")); flush();
  expect(h.dispose).toHaveBeenCalled(); finish({ kind: "terminal", session: context.session, context: null }); await new Promise(done => setTimeout(done, 0)); expect(host.querySelector('[aria-label="Camera preview"]')).toBeNull(); expect(host.textContent).not.toContain("This recording has finished");
});

test("late camera opening after route replacement cannot populate the replacement page", async () => {
  const h = harness(); let finish!: (view: DanceRecorderView) => void;
  h.enter.mockImplementationOnce(async () => new Promise(done => { finish = done; })); const [postId, setPostId] = createSignal(scope.postId);
  const host = mount(() => <DanceSongPage communityId={scope.communityId} postId={postId()} api={h.api} recorder={h.factory} session={authenticated} store={h.store} />);
  await h.choose(host); button(host, "Do this dance").click(); await vi.waitFor(() => expect(h.enter).toHaveBeenCalledTimes(1)); setPostId("different-song"); flush();
  finish({ kind: "objectives", session: context.session, context }); await new Promise(done => setTimeout(done, 0)); expect(host.querySelector("video")).toBeNull(); expect(h.dispose).toHaveBeenCalled();
});

test("anonymous entry makes no private options, ownership or profile read", async () => {
  const h = harness(), host = mount(() => <DanceSongPage {...scope} api={h.api} session={async () => "anonymous"} />);
  await vi.waitFor(() => expect(host.textContent).toContain("Sign in to do")); expect(h.readOptions).not.toHaveBeenCalled(); expect(h.owner).not.toHaveBeenCalled();
});

test("session replacement removes private detail before the next identity resolves", async () => {
  const h = harness(); let signedIn = true;
  const host = mount(() => <DanceSongPage {...scope} api={h.api} recorder={h.factory} session={async () => signedIn ? authenticated() : "anonymous"} />); await h.choose(host);
  signedIn = false; refreshSession(); flush(); expect(host.querySelector('[aria-label="Selected dance"]')).toBeNull(); await vi.waitFor(() => expect(host.textContent).toContain("Sign in to do"));
});

test.each(["participant", "replacement-account"])("cookie renewal as %s preserves or fences an active Dance take", async renewedAccount => {
  const h = harness(); let finish!: (view: DanceRecorderView) => void;
  h.record.mockImplementationOnce(async () => new Promise(done => { finish = done; }));
  const host = h.start(); await h.choose(host); button(host, "Do this dance").click();
  await vi.waitFor(() => expect(host.querySelector('[aria-label="Camera preview"]')).not.toBeNull());
  establishSessionAuthority("participant"); button(host, "Record").click();
  await vi.waitFor(() => expect(h.record).toHaveBeenCalledTimes(1));
  const captureSignal = h.record.mock.calls[0]![0], disposals = h.dispose.mock.calls.length;
  document.cookie = "__Host-pirate_csrf=dance-renewal-fixture; Secure; SameSite=Lax; Path=/";
  expect(readCsrfCookie()).toBe("dance-renewal-fixture");
  vi.stubGlobal("navigator", { locks: { request: <T,>(_name: string, _options: LockOptions, action: () => Promise<T>) => action() } });
  let reads = 0, renewals = 0;
  const reader = createGeneratedApiClient((_origin, options) => ({
    read: () => options.fetchImpl!("https://pirate.sc/users/me", { credentials: "same-origin" }),
  }), { origin: "https://pirate.sc", fetchImpl: async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === "/api/auth/session/renew") {
      renewals++; expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("x-csrf-token")).toBe("dance-renewal-fixture");
      return Response.json({ status: "renewed", user_id: renewedAccount, expires_at: "2099-01-01T00:00:00.000Z" });
    }
    reads++; return new Response(null, { status: reads === 1 ? 401 : 200 });
  } }, { credentials: "same-origin" });
  try {
    if (renewedAccount === "participant") {
      expect((await reader.read()).status).toBe(200); expect(reads).toBe(2);
      expect(captureSignal.aborted).toBe(false); expect(h.dispose).toHaveBeenCalledTimes(disposals);
      finish({ kind: "upload", upload: { kind: "processing", session: context.session } });
      await vi.waitFor(() => expect(host.textContent).toContain("Ready to submit"));
      expect(h.recover).toHaveBeenCalledTimes(1); expect(h.record).toHaveBeenCalledTimes(1);
    } else {
      await expect(reader.read()).rejects.toBeInstanceOf(SessionAuthorityChangedError);
      expect(reads).toBe(1); expect(captureSignal.aborted).toBe(true);
      expect(h.dispose.mock.calls.length).toBeGreaterThan(disposals);
      finish({ kind: "terminal", session: context.session, context: null });
      await new Promise(done => setTimeout(done, 0));
      expect(host.textContent).not.toContain("This recording has finished"); expect(h.recover).not.toHaveBeenCalled();
    }
    expect(renewals).toBe(1);
  } finally {
    document.cookie = "__Host-pirate_csrf=; Secure; Path=/; Max-Age=0";
    vi.unstubAllGlobals();
  }
});

test("page return after a hidden camera starts a new UI operation and ignores the old completion", async () => {
  const h = harness(); let finish!: (view: DanceRecorderView) => void;
  h.record.mockImplementationOnce(async () => new Promise(done => { finish = done; }));
  const host = h.start(); await h.choose(host); button(host, "Do this dance").click(); await vi.waitFor(() => expect(host.querySelector('[aria-label="Camera preview"]')).not.toBeNull()); button(host, "Record").click();
  await vi.waitFor(() => expect(h.record).toHaveBeenCalledTimes(1)); vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden"); document.dispatchEvent(new Event("visibilitychange")); flush();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible"); document.dispatchEvent(new Event("visibilitychange")); flush();
  button(host, "Resume recording").click(); await vi.waitFor(() => expect(h.recover).toHaveBeenCalledTimes(1)); finish({ kind: "terminal", session: context.session, context: null });
  await new Promise(done => setTimeout(done, 0)); expect(host.textContent).not.toContain("This recording has finished");
});


test("funded entry displays the frozen objective and waits for one explicit acceptance", async () => {
  const h = harness();
  h.prepare.mockResolvedValueOnce({ kind: "objectives", session: context.session, context: { ...dancePreparationFixture, session: context.session } });
  const host = h.start(); await h.choose(host); button(host, "Do this dance").click();
  await vi.waitFor(() => expect(host.textContent).toContain("Before you record"));
  expect(host.textContent).toContain("test USDC"); expect(host.textContent).toContain("passed owner review");
  expect(h.enter).not.toHaveBeenCalled(); expect(host.querySelector('[aria-label="Camera preview"]')).toBeNull();
  button(host, "Accept and continue").click();
  await vi.waitFor(() => expect(host.querySelector('[aria-label="Camera preview"]')).not.toBeNull());
  expect(h.enter).toHaveBeenCalledTimes(1); expect(h.enter.mock.calls[0]![0]).toBe(context.session.terms_hash);
});


test("recovering an uncertain funded acceptance replays it without asking for another intent", async () => {
  const h = harness(); const funded = { ...dancePreparationFixture, session: context.session };
  h.prepare.mockResolvedValueOnce({ kind: "objectives", session: context.session, context: funded });
  h.enter.mockRejectedValueOnce(new Error("reply_lost"));
  h.recover.mockResolvedValueOnce({ kind: "objectives", session: context.session, context: funded, consentRequested: true });
  const host = h.start(); await h.choose(host); button(host, "Do this dance").click();
  await vi.waitFor(() => expect(host.textContent).toContain("Before you record")); button(host, "Accept and continue").click();
  await vi.waitFor(() => expect(host.textContent).toContain("was interrupted")); button(host, "Resume recording").click();
  await vi.waitFor(() => expect(host.querySelector('[aria-label="Camera preview"]')).not.toBeNull());
  expect(h.enter).toHaveBeenCalledTimes(2); expect(host.textContent).not.toContain("Accept and continue");
});
