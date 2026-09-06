export interface PlaybackAttachment {
  readonly video: HTMLVideoElement;
  readonly url: string;
  readonly position: number;
  readonly resume: boolean;
  readonly signal: AbortSignal;
  readonly onFailure: () => void;
}
/** HLS on MSE browsers; native HLS when MediaSource is unavailable. */
export async function attachPlayback(input: PlaybackAttachment): Promise<() => void> {
  const { default: Hls } = await import("hls.js");
  if (input.signal.aborted) return () => {};
  if (Hls.isSupported()) {
    const hls = new Hls({ enableWorker: true, startPosition: input.position });
    let destroyed = false;
    const cleanup = () => { if (destroyed) return; destroyed = true; input.signal.removeEventListener("abort", cleanup); hls.destroy(); };
    input.signal.addEventListener("abort", cleanup, { once: true });
    hls.on(Hls.Events.ERROR, (_event, data) => { if (!input.signal.aborted && data.fatal) input.onFailure(); });
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (!input.signal.aborted && input.resume) void input.video.play().catch(() => {});
    });
    hls.loadSource(input.url); hls.attachMedia(input.video);
    return cleanup;
  }
  if (!input.video.canPlayType("application/vnd.apple.mpegurl")) throw new Error("Unsupported playback");
  const seek = () => {
    if (input.signal.aborted) return;
    input.video.currentTime = input.position;
    if (input.resume) void input.video.play().catch(() => {});
  };
  input.video.addEventListener("loadedmetadata", seek, { once: true, signal: input.signal });
  input.video.src = input.url;
  return () => input.video.removeEventListener("loadedmetadata", seek);
}
