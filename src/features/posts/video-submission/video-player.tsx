import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { attachPlayback } from "./playback-engine";
import { mintPlaybackAccess, videoPosterPath, type PlaybackGrant } from "./playback-access";
import { VideoDeliveryPending } from "./video-delivery-pending";
import type { VideoDeliveryState } from "./delivery-state";

/** Grants live only in this mounted player; neither SSR nor feed caches hold them. */
export function VideoPlayer(props: {
  readonly postId: string;
  readonly state: VideoDeliveryState;
  readonly mint?: typeof mintPlaybackAccess;
  readonly attach?: typeof attachPlayback;
}) {
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
      if (props.state.thumbnail === "ready") setPoster(videoPosterPath(props.postId));
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
      setPoster(inView && inForeground && thumbnail === "ready" ? videoPosterPath(id) : undefined);
    });
  onCleanup(stop);
  return <section ref={host} aria-label="Published video" data-video-player-state={status()}>
    <Show when={props.state.playback === "ready"} fallback={<><VideoDeliveryPending state={props.state} showThumbnailMessage={false} /><Show when={poster()}>{src => <img src={src()} alt="Video thumbnail" onError={() => setPoster(undefined)} />}</Show><Show when={!poster()}><p>{props.state.thumbnail === "pending" ? "Thumbnail is being prepared." : props.state.thumbnail === "ready" ? "Thumbnail could not be loaded yet." : "Thumbnail is unavailable."}</p></Show></>}>
      <video ref={video} controls playsinline preload="metadata" crossorigin="anonymous" poster={poster()} class="max-h-[80dvh] w-full bg-black object-contain"
        onCanPlay={() => { if (abort && !abort.signal.aborted) setStatus("ready"); }}
        onError={() => { if (status() === "ready" || status() === "loading") fail(); }} />
      <Show when={status() === "loading"}><p role="status">Preparing playback…</p></Show>
      <Show when={status() === "unavailable"}>
        <p role="status">Playback is unavailable. Your access may have changed, or delivery needs attention.</p>
        <button type="button" onClick={() => { if (visible() && foreground() && Date.now() - lastMint >= 10_000) void acquire(); }}>Try playback again</button>
      </Show>
    </Show>
  </section>;
}
