import { AgeAccessPrompt } from "../../verification/age-access-prompt.tsx";
import type { verifyAdultViewing } from "../../verification/age-verification.ts";
import { IconPlay } from "../../../design-system";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { attachPlayback } from "./playback-engine";
import { mintPlaybackAccess, videoPosterPath, type PlaybackGrant } from "./playback-access";
import { VideoDeliveryPending } from "./video-delivery-pending";
import type { VideoDeliveryState } from "./delivery-state";

/** Grants live only in this mounted player; neither SSR nor feed caches hold them. */
export function VideoPlayer(props: {
  readonly postId: string;
  readonly requiresAgeVerification?: boolean;
  readonly verifyAge?: typeof verifyAdultViewing;
  readonly state: VideoDeliveryState;
  readonly mint?: typeof mintPlaybackAccess;
  readonly attach?: typeof attachPlayback;
  /** Test/review seam; production reads the cookie-authorized poster route. */
  readonly posterPath?: (postId: string) => string;
  /**
   * Feed policy for the active row. False keeps the player paused (the row is
   * not active, a panel is open or autoplay is off); true plays once the media
   * is ready and the row is visible.
   */
  readonly autoplay?: boolean;
  /** Controlled audio state from the feed. */
  readonly muted?: boolean;
  /** Called on a user-initiated play so the feed can unlock its autoplay gate. */
  readonly onUserInteraction?: () => void;
}) {
  const posterPath = (postId: string) => (props.posterPath ?? videoPosterPath)(postId);
  let host!: HTMLElement;
  let video!: HTMLVideoElement;
  let detach: (() => void) | undefined;
  let abort: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let requestTimer: ReturnType<typeof setTimeout> | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let position = 0;
  let resume = false;
  let lastMint = 0;
  let lastPost = props.postId;
  const [visible, setVisible] = createSignal(false, { ownedWrite: true });
  const [foreground, setForeground] = createSignal(true, { ownedWrite: true });
  const [status, setStatus] = createSignal<"idle" | "loading" | "ready" | "unavailable">("idle", { ownedWrite: true });
  const [poster, setPoster] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  // Playing is driven by the media element's own events, so the paused overlay
  // reflects real playback and never a request that was refused.
  const [playing, setPlaying] = createSignal(false, { ownedWrite: true });
  function rememberPlayback() {
    if (!video || !detach || video.readyState < HTMLMediaElement.HAVE_METADATA) return;
    if (Number.isFinite(video.currentTime)) position = video.currentTime;
    resume = !video.paused;
  }
  function stop() {
    rememberPlayback();
    generation++; abort?.abort(); abort = undefined;
    clearTimeout(timer); clearTimeout(expiryTimer); clearTimeout(requestTimer);
    if (video) {
      video.pause(); detach?.(); detach = undefined;
      video.removeAttribute("src"); video.load();
    }
    setPlaying(false);
    setPoster(undefined);
  }
  function fail() { stop(); setStatus("unavailable"); }
  async function attach(grant: PlaybackGrant, expected: number) {
    const cleanup = await (props.attach ?? attachPlayback)({ video, url: grant.url,
      position, resume,
      signal: abort!.signal, onFailure: () => { if (generation === expected) fail(); } });
    if (generation !== expected) cleanup(); else detach = cleanup;
  }
  async function acquire() {
    const expected = generation;
    rememberPlayback();
    abort?.abort(); detach?.(); detach = undefined; abort = new AbortController();
    clearTimeout(timer); clearTimeout(expiryTimer); clearTimeout(requestTimer);
    lastMint = Date.now(); setStatus("loading");
    requestTimer = setTimeout(() => { if (generation === expected) fail(); }, 10_000);
    try {
      const grant = await (props.mint ?? mintPlaybackAccess)(props.postId, abort.signal);
      if (generation !== expected || abort.signal.aborted) return;
      clearTimeout(requestTimer);
      if (props.state.thumbnail === "ready") setPoster(posterPath(props.postId));
      // Expiry still stops buffered playback if a renewal request hangs.
      expiryTimer = setTimeout(() => { if (generation === expected) fail(); }, Math.max(0, grant.expiresAt - Date.now()));
      await attach(grant, expected);
      if (generation !== expected) return;
      timer = setTimeout(() => { if (generation === expected) void renew(grant.expiresAt); }, Math.max(1, grant.renewAt - Date.now()));
    } catch { if (generation === expected) fail(); }
  }
  async function renew(previousExpiry: number) {
    // Preserve the previous expiry fence while the access endpoint is pending.
    const expected = generation;
    const deadline = setTimeout(() => { if (generation === expected) fail(); }, Math.max(0, previousExpiry - Date.now()));
    try { await acquire(); } finally { clearTimeout(deadline); }
  }
  createEffect(() => true, () => {
    setForeground(document.visibilityState !== "hidden");
    const change = () => setForeground(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", change);
    if (typeof IntersectionObserver === "undefined") { setVisible(true); onCleanup(() => document.removeEventListener("visibilitychange", change)); return; }
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { threshold: 0.25 });
    observer.observe(host);
    onCleanup(() => { observer.disconnect(); document.removeEventListener("visibilitychange", change); });
  });
  createEffect(
    () => [visible(), foreground(), props.postId, props.state.playback] as const,
    ([inView, inForeground, _id, state]) => {
      stop(); setStatus("idle");
      if (lastPost !== _id) { lastPost = _id; position = 0; resume = false; }
      if (inView && inForeground && state === "ready") void acquire();
    },
  );
  createEffect(() => [visible(), foreground(), props.postId, props.state.thumbnail, props.state.playback] as const,
    ([inView, inForeground, id, thumbnail]) => {
      setPoster(inView && inForeground && thumbnail === "ready" ? posterPath(id) : undefined);
    });
  // Active-row playback policy. The feed owns whether this row should play;
  // the activation is delegated to the play intent, not to `canplay` alone.
  // Muting the software decoder still lets `currentTime` advance.
  createEffect(
    () => [props.autoplay !== false, props.muted === true, status(), visible(), foreground()] as const,
    ([autoplay, muted, playbackStatus, inView, inForeground]) => {
      if (video === undefined) return;
      if (video.muted !== muted) video.muted = muted;
      if (autoplay && playbackStatus === "ready" && inView && inForeground) {
        resume = true;
        if (video.paused) {
          const started = video.play();
          if (started !== undefined) void started.catch(() => {});
        }
        return;
      }
      if (!autoplay) {
        resume = false;
        if (!video.paused) video.pause();
      }
    },
  );
  onCleanup(stop);
  return <section ref={host} aria-label="Published video" class="relative" data-video-player-playing={playing()} data-video-player-state={status()}>
    <Show when={props.state.playback === "ready"} fallback={<><VideoDeliveryPending state={props.state} showThumbnailMessage={false} /><Show when={poster()}>{src => <img src={src()} alt="Video thumbnail" onError={() => setPoster(undefined)} />}</Show><Show when={!poster()}><p>{props.state.thumbnail === "pending" ? "Thumbnail is being prepared." : props.state.thumbnail === "ready" ? "Thumbnail could not be loaded yet." : "Thumbnail is unavailable."}</p></Show></>}>
      <video ref={video} controls playsinline preload="metadata" crossorigin="anonymous" muted={props.muted === true} poster={poster()} class="max-h-[80dvh] w-full bg-black object-contain"
        onCanPlay={() => { if (abort && !abort.signal.aborted) setStatus("ready"); }}
        onError={() => { if (status() === "ready" || status() === "loading") fail(); }}
        onPause={() => setPlaying(false)}
        onPlay={() => { setPlaying(true); props.onUserInteraction?.(); }} />
      <Show when={status() === "ready" && !playing()}>
        <button
          aria-label="Play video"
          class="absolute inset-0 m-auto grid size-16 place-items-center rounded-full bg-black/60 text-white shadow-lg"
          data-video-player-play
          onClick={() => {
            // An explicit play affordance: this is the interaction that unlocks
            // the feed gate. Muting alone never does.
            props.onUserInteraction?.();
            const started = video.play();
            if (started !== undefined) void started.catch(() => {});
          }}
          type="button"
        >
          <IconPlay class="ml-1 size-8" />
        </button>
      </Show>
      <Show when={status() === "loading"}><p role="status">Preparing playback…</p></Show>
      <Show when={status() === "unavailable"}>
        <Show when={props.requiresAgeVerification}><AgeAccessPrompt verify={props.verifyAge} onVerified={async () => { resume = false; if (visible() && foreground()) await acquire(); }} /></Show>
        <p role="status">Playback is unavailable. Your access may have changed, or delivery needs attention.</p>
        <button type="button" onClick={() => { if (visible() && foreground() && Date.now() - lastMint >= 10_000) void acquire(); }}>Try playback again</button>
      </Show>
    </Show>
  </section>;
}
