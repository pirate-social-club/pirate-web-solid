/** @jsxImportSource @solidjs/web */
import { render } from "@solidjs/web";
import { createRoot } from "solid-js";
import { webcrypto } from "node:crypto";
import { ApiClientError } from "@pirate/api-client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { VideoComposerRuntime } from "./video-composer-runtime";
import type { PendingVideo, VideoStorage } from "./coordinator";
import type { VideoCommand, VideoTransport } from "./transport";
import type { OriginalVideoReservation, VideoSnapshot } from "./contracts";
import type { SongIntervalPreflight } from "./song-reference";

const disposers: (() => void)[] = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function setup(final: "published" | "manual_review" | "provider_submission_unconfirmed" | "membership_required", rejectKind?: "reserve" | "start", beforeExecute?: (command: VideoCommand) => Promise<void>) {
  vi.stubGlobal("crypto", webcrypto);
  const urlApi = class extends URL { static createObjectURL() { return "blob:https://example.test/video"; } static revokeObjectURL() {} };
  vi.stubGlobal("URL", urlApi);
  let saved: PendingVideo | null = null;
  const storage: VideoStorage = { async exclusive(work) { return work(); }, async load() { return saved; }, async save(record) { saved = record; }, async remove() { saved = null; } };
  const reservation: OriginalVideoReservation = { track: "video", intent: "original_audio", status: "awaiting_upload", slot: "primary_video", author_persona_id: "persona", ingest_policy_revision: 1, reservation_id: "reservation",
    upload: { method: "MULTIPART", upload_id: "upload", part_count: 1, part_size_bytes: 10, expires_at: "2099-01-01T00:00:00Z", parts: [{ part_number: 1, url: "https://upload.example/1", expires_at: "2099-01-01T00:00:00Z" }] } };
  const common = { track: "video" as const, intent: "original_audio" as const, submission_id: "submission", author_persona: { object: "persona" as const, persona_id: "persona", display_name: null, avatar_ref: null, primary_public_handle: null }, creation_revision: 1, video_revision: 0, caption: "", updated_at: "2026-09-05T00:00:00Z", href: "/media-post-submissions/submission" };
  let snapshot: VideoSnapshot = { ...common, status: "processing", phase: "awaiting_upload" };
  const commands: VideoCommand[] = [];
  const transport: VideoTransport = { async read() { return snapshot; }, async execute(command) {
    commands.push(command); await beforeExecute?.(command);
    if (command.kind === rejectKind) throw new ApiClientError(
      { status: 400, code: "bad_request", name: "BadRequest", retryable: false },
      { error: { code: "bad_request", message: "Request refused", retryable: false } });
    if (command.kind === "reserve") return reservation;
    if (command.kind === "finalize") snapshot = final === "published"
      ? { ...common, creation_revision: 2, video_revision: 1, status: "published", published_resource: { post_id: "post", href: "/posts/post" } }
      : final === "manual_review"
        ? { ...common, creation_revision: 2, video_revision: 1, status: "manual_review", reason_codes: ["media_review_required"], review_ref: "review" }
        : { ...common, creation_revision: 2, video_revision: 1, status: "processing_failed", reason_code: final, retryable: final === "membership_required", retry_count: 0 };
    return snapshot;
  } };
  const published = vi.fn(); const container = document.createElement("div"); document.body.appendChild(container);
  createRoot(dispose => { disposers.push(dispose); render(() => <VideoComposerRuntime principalId="account" communityId="community" personaId="persona"
    storage={storage} transport={transport} inspectFile={async file => file}
    fetchImpl={vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { headers: { etag: "receipt" } }))}
    onExit={() => {}} onRetainedPersona={() => {}} onPublished={published} />, container); });
  return { commands, published };
}
async function selectAndPublish() {
  await vi.waitFor(() => expect(document.querySelector("[inert]")).toBeNull());
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["video"], "take.mp4", { type: "video/mp4" })] });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.waitFor(() => expect(document.querySelector("textarea")).not.toBeNull());
  const publish = [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === "Publish video")!;
  await vi.waitFor(() => expect(publish.disabled).toBe(false)); publish.click();
}
describe("mounted original video flow", () => {
  test.each(["reserve", "start"] as const)("a rejected %s returns to editing only on explicit action", async kind => {
    const fixture = setup("published", kind); await selectAndPublish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("request rejected"));
    const commandCount = fixture.commands.length;
    expect([...document.querySelectorAll("button")].some(button => button.textContent?.includes("Resume video submission"))).toBe(false);
    const edit = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("Edit rejected video"))!;
    await vi.waitFor(() => expect(edit.disabled).toBe(false)); edit.click();
    await vi.waitFor(() => expect(document.querySelector("textarea")).not.toBeNull());
    expect(document.body.textContent).toContain("Publish video");
    expect(fixture.commands).toHaveLength(commandCount);
    expect(fixture.published).not.toHaveBeenCalled();
  });
  test("reserves, uploads and finalizes without a title, terms or client poster", async () => {
    const fixture = setup("published"); await selectAndPublish();
    await vi.waitFor(() => expect(fixture.published).toHaveBeenCalledOnce());
    expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]);
    expect(fixture.commands[0]?.input.body).toMatchObject({ intent: "original_audio", persona_id: "persona" });
    expect(fixture.commands[1]?.input.body).not.toHaveProperty("title");
    expect(fixture.commands[2]?.input.body).toMatchObject({ parts: [{ part_number: 1, etag: "receipt" }] });
    expect(document.querySelector('a[href="/posts/post"]')?.textContent).toBe("View published post");
  });
  test("unconfirmed provider submission hides retry and explains reconciliation", async () => {
    setup("provider_submission_unconfirmed"); await selectAndPublish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("provider submission is unconfirmed"));
    expect([...document.querySelectorAll("button")].some(button => /Retry processing|Retry publication/.test(button.textContent ?? ""))).toBe(false);
  });
  test("membership loss offers publication retry with retained analysis", async () => {
    setup("membership_required"); await selectAndPublish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("posting eligibility"));
    expect(document.body.textContent).toContain("Retry publication"); expect(document.body.textContent).not.toContain("Retry processing");
  });
  test("a server review hold stays private and does not claim publication", async () => {
    const fixture = setup("manual_review"); await selectAndPublish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("No post is public yet"));
    expect(fixture.published).not.toHaveBeenCalled(); expect(document.querySelector("a")).toBeNull();
  });
});


test("unmount during reservation preserves it without starting upload", async () => {
  let release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  const fixture = setup("published", undefined, async command => {
    if (command.kind === "reserve") { entered(); await waiting; }
  });
  await selectAndPublish(); await started; disposers.pop()!(); release();
  await vi.waitFor(() => expect(fixture.commands.map(command => command.kind)).toEqual(["reserve"]));
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(fixture.commands.map(command => command.kind)).toEqual(["reserve"]);
  expect(fixture.published).not.toHaveBeenCalled();
});

describe("mounted song-backed video flow", () => {
  const ready = (interval: { accepted: true } | { accepted: false; reason: "interval_too_long" } | null) => ({
    state: "ready" as const, song_post_id: "song-post", audio_revision: 7, canonical_duration_samples: 10_080_047,
    interval_policy: { policy_revision: 1, sample_rate_hz: 48_000 as const, min_clip_duration_samples: 144_000, max_clip_duration_samples: 8_640_000 },
    interval,
  });
  const unavailable = () => new ApiClientError({ status: 400, code: "bad_request", name: "BadRequest", retryable: false },
    { error: { code: "bad_request", message: "Video capability is unavailable", retryable: false,
      details: { reason_code: "capability_unavailable", track: "video", capability: "song_reference" } } });

  function songSetup(options: {
    readonly preflight: "unavailable" | "accepted" | "refused" | "pending";
    readonly reserve?: "echo" | "unavailable" | "different_excerpt";
    readonly finalSnapshot?: "published" | "song_blocked";
    readonly draft?: { readonly startMs: number; readonly endMs: number };
    readonly seedDraft?: boolean;
    readonly reader?: "ready" | "pending" | "failed";
  }) {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("URL", class extends URL { static createObjectURL() { return "blob:https://example.test/video"; } static revokeObjectURL() {} });
    const draft = options.draft ?? { startMs: 31_000, endMs: 43_000 };
    if (options.seedDraft !== false) {
      localStorage.setItem("song-excerpt-draft:account", JSON.stringify({ version: "song-excerpt-draft-v2", songPostId: "song-post", ...draft }));
    }
    let saved: PendingVideo | null = null;
    const storage: VideoStorage = { async exclusive(work) { return work(); }, async load() { return saved; }, async save(record) { saved = record; }, async remove() { saved = null; } };
    const upload = { method: "MULTIPART" as const, upload_id: "upload", part_count: 1, part_size_bytes: 10, expires_at: "2099-01-01T00:00:00Z", parts: [{ part_number: 1, url: "https://upload.example/1", expires_at: "2099-01-01T00:00:00Z" }] };
    const base = { track: "video" as const, status: "awaiting_upload" as const, slot: "primary_video" as const, author_persona_id: "persona", ingest_policy_revision: 1, reservation_id: "reservation", upload };
    const preflightCalls: unknown[] = [];
    const preflight: SongIntervalPreflight = async input => {
      preflightCalls.push(input.body);
      if (options.preflight === "unavailable") throw unavailable();
      if (options.preflight === "pending") return new Promise(() => {});
      const verdict = options.preflight === "refused" && input.body.interval !== undefined
        ? { accepted: false as const, reason: "interval_too_long" as const }
        : input.body.interval === undefined ? null : { accepted: true as const };
      return { ...ready(verdict), song_post_id: input.body.song_post_id };
    };
    const common = { track: "video" as const, intent: "song_reference" as const, submission_id: "submission", author_persona: { object: "persona" as const, persona_id: "persona", display_name: null, avatar_ref: null, primary_public_handle: null }, creation_revision: 1, video_revision: 0, caption: "", updated_at: "2026-09-11T00:00:00Z", href: "/media-post-submissions/submission" };
    let snapshot: VideoSnapshot = { ...common, status: "processing", phase: "awaiting_upload" };
    const commands: VideoCommand[] = [];
    const transport: VideoTransport = { async read() { return snapshot; }, async execute(command) {
      commands.push(command);
      if (command.kind === "reserve") {
        const body = command.input.body;
        if (body.track !== "video") throw new Error("not a video");
        if (body.intent === "original_audio") return { ...base, intent: "original_audio" };
        if (options.reserve === "unavailable") throw unavailable();
        const interval = { clip_start_samples: body.clip_start_samples, clip_duration_samples: body.clip_duration_samples, song_duration_samples: 10_080_047 };
        const echoed = {
          ...base, intent: "song_reference" as const,
          song_reference: { song_post_id: body.song_post_id, audio_revision: body.audio_revision, song_asset_id: "song-asset" },
          reservation_policy_snapshot: { observed_at_transition: "media_reservation_issued" as const, owner_policy_revision: 3, owner_policy_hash: "a".repeat(64), derivative_video: "allowed" as const, observed_at: "2026-09-11T00:00:00Z" },
          interval: options.reserve === "different_excerpt" ? { ...interval, clip_start_samples: interval.clip_start_samples + 48 } : interval,
        };
        // The real transport's check, so a differing echo fails exactly as it would.
        return (await import("./contracts")).verifySongReservation(body, echoed);
      }
      if (command.kind === "finalize") snapshot = options.finalSnapshot === "song_blocked"
        ? { ...common, creation_revision: 2, video_revision: 1, status: "blocked", reason_code: "song_reference_invalid", song_post_id: "song-post", song_reason_code: "derivative_video_blocked" }
        : { ...common, creation_revision: 2, video_revision: 1, status: "published", published_resource: { post_id: "post", href: "/posts/post" } };
      return snapshot;
    } };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { headers: { etag: "receipt" } }));
    const songReader = options.reader === "pending"
      ? async () => new Promise<never>(() => {})
      : options.reader === "failed"
        ? async () => { throw new Error("read failed"); }
        : async () => ({ instrumental_audio_url: "https://audio.example/song.mp3", title: "A song" });
    const container = document.createElement("div"); document.body.appendChild(container);
    createRoot(dispose => { disposers.push(() => { dispose(); localStorage.clear(); }); render(() => <VideoComposerRuntime principalId="account" communityId="community" personaId="persona"
      storage={storage} transport={transport} inspectFile={async file => file} fetchImpl={fetchImpl}
      songPreflight={preflight} songReader={songReader}
      onExit={() => {}} onRetainedPersona={() => {}} />, container); });
    return { commands, preflightCalls, fetchImpl, current: () => saved };
  }

  const button = (label: string) => [...document.querySelectorAll("button")].find(candidate => candidate.textContent?.trim() === label);
  const plan = () => document.querySelector("[data-song-plan]");
  async function chooseVideo() {
    await vi.waitFor(() => expect(document.querySelector("[inert]")).toBeNull());
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["video"], "take.mp4", { type: "video/mp4" })] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector('input[aria-label="Song link or post id"]')).not.toBeNull());
  }
  async function chooseVideoAndSong(element: { readonly seconds: number; readonly afterServerTiming: boolean } = { seconds: 210, afterServerTiming: false }) {
    await chooseVideo();
    const link = document.querySelector<HTMLInputElement>('input[aria-label="Song link or post id"]')!;
    link.value = "song-post"; link.dispatchEvent(new InputEvent("input", { bubbles: true }));
    // Typing and tapping are separate tasks for a person; a signal written in
    // one is read in the next.
    await new Promise(resolve => setTimeout(resolve, 0));
    button("Load")!.click();
    await vi.waitFor(() => expect(document.querySelector("audio")).not.toBeNull());
    if (element.afterServerTiming) await vi.waitFor(() => expect(document.body.textContent).toContain("Bounded by the server’s measured length"));
    // The element's own length, as a browser would report it once metadata loads.
    const audio = document.querySelector("audio")!;
    Object.defineProperty(audio, "duration", { configurable: true, value: element.seconds });
    audio.dispatchEvent(new Event("loadedmetadata"));
  }
  async function loadSong(songPostId: string) {
    const link = document.querySelector<HTMLInputElement>('input[aria-label="Song link or post id"]')!;
    link.value = songPostId; link.dispatchEvent(new InputEvent("input", { bubbles: true }));
    // Typing and tapping are separate tasks for a person; a signal written in
    // one is read in the next.
    await new Promise(resolve => setTimeout(resolve, 0));
    button("Load")!.click();
  }
  async function publish() {
    const control = button("Publish video")!;
    await vi.waitFor(() => expect(control.disabled).toBe(false)); control.click();
  }

  test("with the capability off, a retained excerpt blocks publishing until the author chooses the video's own sound", async () => {
    const fixture = songSetup({ preflight: "unavailable" });
    await chooseVideoAndSong();
    await vi.waitFor(() => expect(plan()?.getAttribute("data-song-plan")).toBe("not_available"));
    expect(plan()?.textContent).toContain("Posting a video to a song isn’t available yet");
    await publish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("hasn’t been accepted"));
    expect(fixture.commands).toHaveLength(0);
    button("Use original sound")!.click();
    await publish();
    await vi.waitFor(() => expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]));
    expect(fixture.commands[0]?.input.body).toMatchObject({ intent: "original_audio" });
    expect(fixture.commands[0]?.input.body).not.toHaveProperty("song_post_id");
    expect(JSON.parse(localStorage.getItem("song-excerpt-draft:account") ?? "null")).toMatchObject({ songPostId: "song-post", startMs: 31_000, endMs: 43_000 });
  });

  test("loading a song blocks publishing before any excerpt is retained", async () => {
    const fixture = songSetup({ preflight: "accepted", seedDraft: false });
    await chooseVideoAndSong();
    await vi.waitFor(() => expect(plan()?.getAttribute("data-song-plan")).toBe("none"));
    expect(plan()?.textContent).toContain("A song is chosen");
    await publish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("hasn’t been accepted"));
    expect(fixture.commands).toHaveLength(0);
    button("Use original sound")!.click();
    await publish();
    await vi.waitFor(() => expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]));
    expect(fixture.commands[0]?.input.body).toMatchObject({ intent: "original_audio" });
    expect(fixture.commands[0]?.input.body).not.toHaveProperty("song_post_id");
  });

  test("publishing is blocked while the first song load is unresolved", async () => {
    const fixture = songSetup({ preflight: "accepted", reader: "pending" });
    await chooseVideo();
    await loadSong("song-pending");
    await vi.waitFor(() => expect(document.body.textContent).toContain("Loading that song…"));
    await publish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("hasn’t been accepted"));
    expect(fixture.commands).toHaveLength(0);
    button("Use original sound")!.click();
    await publish();
    await vi.waitFor(() => expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]));
    expect(fixture.commands[0]?.input.body).toMatchObject({ intent: "original_audio" });
  });

  test("a failed first song load still blocks publishing until the author chooses original sound", async () => {
    const fixture = songSetup({ preflight: "accepted", reader: "failed" });
    await chooseVideo();
    await loadSong("song-missing");
    await vi.waitFor(() => expect(document.body.textContent).toContain("That song could not be loaded"));
    await publish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("hasn’t been accepted"));
    expect(fixture.commands).toHaveLength(0);
    button("Use original sound")!.click();
    await publish();
    await vi.waitFor(() => expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]));
    expect(fixture.commands[0]?.input.body).toMatchObject({ intent: "original_audio" });
  });

  test("switching songs keeps publishing blocked until the new excerpt is accepted", async () => {
    const fixture = songSetup({ preflight: "accepted" });
    await chooseVideoAndSong();
    await vi.waitFor(() => expect(plan()?.getAttribute("data-song-plan")).toBe("ready"));
    await loadSong("song-two");
    await vi.waitFor(() => expect(fixture.preflightCalls).toContainEqual({ song_post_id: "song-two" }));
    await vi.waitFor(() => expect(plan()?.getAttribute("data-song-plan")).toBe("none"));
    expect(plan()?.textContent).toContain("A song is chosen");
    await publish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("hasn’t been accepted"));
    expect(fixture.commands).toHaveLength(0);
    button("Use original sound")!.click();
    await publish();
    await vi.waitFor(() => expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]));
    expect(fixture.commands[0]?.input.body).toMatchObject({ intent: "original_audio" });
  });

  test("explicit original-sound mode publishes while the excerpt is still being checked", async () => {
    const fixture = songSetup({ preflight: "pending" });
    await chooseVideoAndSong();
    await vi.waitFor(() => expect(plan()?.getAttribute("data-song-plan")).toBe("checking"));
    await publish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("is still being checked"));
    expect(fixture.commands).toHaveLength(0);
    button("Use original sound")!.click();
    await publish();
    await vi.waitFor(() => expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]));
    expect(fixture.commands[0]?.input.body).toMatchObject({ intent: "original_audio" });
  });

  test("a refused excerpt blocks publishing until the author chooses the video's own sound", async () => {
    const fixture = songSetup({ preflight: "refused" });
    await chooseVideoAndSong();
    await vi.waitFor(() => expect(plan()?.getAttribute("data-song-plan")).toBe("refused"));
    expect(plan()?.textContent).toContain("longer than the server allows");
    await publish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("hasn’t been accepted"));
    expect(fixture.commands).toHaveLength(0);
    button("Use original sound")!.click();
    await publish();
    await vi.waitFor(() => expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]));
    expect(fixture.commands[0]?.input.body).toMatchObject({ intent: "original_audio" });
    expect(fixture.commands[0]?.input.body).not.toHaveProperty("song_post_id");
  });

  test("an accepted excerpt is replaced by the video's own sound only on the author's explicit choice", async () => {
    const fixture = songSetup({ preflight: "accepted", reserve: "echo" });
    await chooseVideoAndSong();
    await vi.waitFor(() => expect(plan()?.getAttribute("data-song-plan")).toBe("ready"));
    button("Use original sound")!.click();
    await vi.waitFor(() => expect(button("Use the song instead")).toBeDefined());
    await publish();
    await vi.waitFor(() => expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]));
    expect(fixture.commands[0]?.input.body).toMatchObject({ intent: "original_audio" });
    expect(fixture.commands[0]?.input.body).not.toHaveProperty("song_post_id");
    expect(JSON.parse(localStorage.getItem("song-excerpt-draft:account") ?? "null")).toMatchObject({ songPostId: "song-post", startMs: 31_000, endMs: 43_000 });
  });

  test("without server timing, a retained excerpt is restored against the element's length", async () => {
    songSetup({ preflight: "unavailable" });
    await chooseVideoAndSong();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Restored 31000–43000 ms from the video draft."));
    expect(document.body.textContent).toContain("start 31000 ms · end 43000 ms");
  });

  test("an accepted excerpt is reserved as exact samples at the server's revision, and the frozen echo is confirmed", async () => {
    const fixture = songSetup({ preflight: "accepted", reserve: "echo" });
    await chooseVideoAndSong();
    await vi.waitFor(() => expect(plan()?.getAttribute("data-song-plan")).toBe("ready"));
    expect(fixture.preflightCalls).toContainEqual({ song_post_id: "song-post" });
    expect(fixture.preflightCalls).toContainEqual({ song_post_id: "song-post", interval: { clip_start_samples: 1_488_000, clip_duration_samples: 576_000 } });
    expect(plan()?.textContent).toContain("0:31 to 0:43");
    await publish();
    await vi.waitFor(() => expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]));
    expect(fixture.commands[0]?.input.body).toMatchObject({
      intent: "song_reference", song_post_id: "song-post", audio_revision: 7, selected_from: { kind: "library" },
      clip_start_samples: 1_488_000, clip_duration_samples: 576_000,
    });
    expect(fixture.current()?.version).toBe("song-video-pending-v1");
    await vi.waitFor(() => expect(document.body.textContent).toContain("reserved this video as posted to the song, from 0:31 to 0:43"));
  });

  test("the server's canonical length bounds the excerpt, not the audio element's", async () => {
    // The element reports 212 s; the server measured 210 s. A retained 200-212 s
    // excerpt is clamped to the canonical end before anything is sent.
    const fixture = songSetup({ preflight: "accepted", draft: { startMs: 200_000, endMs: 212_000 } });
    await chooseVideoAndSong({ seconds: 212, afterServerTiming: true });
    await vi.waitFor(() => expect(plan()?.getAttribute("data-song-plan")).toBe("ready"));
    expect(fixture.preflightCalls).toContainEqual({ song_post_id: "song-post", interval: { clip_start_samples: 9_600_000, clip_duration_samples: 480_000 } });
    expect(fixture.preflightCalls).not.toContainEqual(expect.objectContaining({ interval: { clip_start_samples: 9_600_000, clip_duration_samples: 576_000 } }));
    expect(document.body.textContent).toContain("210000 ms, of audio revision 7");
  });

  test("a reservation refused because the capability is off explains it, and editing publishes own sound", async () => {
    const fixture = songSetup({ preflight: "accepted", reserve: "unavailable" });
    await chooseVideoAndSong();
    await vi.waitFor(() => expect(plan()?.getAttribute("data-song-plan")).toBe("ready"));
    await publish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Edit the video to publish it with its own sound"));
    expect(fixture.fetchImpl).not.toHaveBeenCalled();
    button("Edit rejected video")!.click();
    await vi.waitFor(() => expect(button("Publish video")).toBeDefined());
    await publish();
    await vi.waitFor(() => expect(fixture.commands.filter(command => command.kind === "reserve")).toHaveLength(2));
    expect(fixture.commands[1]?.input.body).toMatchObject({ intent: "original_audio" });
  });

  test("an echo of a different excerpt is a visible failure and nothing is uploaded", async () => {
    const fixture = songSetup({ preflight: "accepted", reserve: "different_excerpt" });
    await chooseVideoAndSong();
    await vi.waitFor(() => expect(plan()?.getAttribute("data-song-plan")).toBe("ready"));
    await publish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("confirmed a different song or excerpt"));
    expect(fixture.commands.map(command => command.kind)).toEqual(["reserve"]);
    expect(fixture.fetchImpl).not.toHaveBeenCalled();
    expect(button("Edit rejected video")).toBeDefined();
  });

  test("a song video blocked because the song can no longer be used says why", async () => {
    songSetup({ preflight: "accepted", reserve: "echo", finalSnapshot: "song_blocked" });
    await chooseVideoAndSong();
    await vi.waitFor(() => expect(plan()?.getAttribute("data-song-plan")).toBe("ready"));
    await publish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("no longer allows videos to be posted to it"));
    expect(document.body.textContent).toContain("Start a new video");
  });
});
