import { prepareBufferedGuide, type GuideSourcePreparation } from "../posts/video-submission/buffered-guide";
import type { DanceCaptureContext } from "./dance-preparation-api";

export interface DanceCaptureGuide {
  readonly sessionId: string;
  readonly termsHash: string;
  /** The recorder supplies its shared source-arrival origin, never encoder-ready
   * time. Starting this listening source does not authorize recording. */
  start(originMs: number, assertCaptureCurrent: () => void, onFailure: (error: Error) => void): void;
  dispose(): void;
}

/** Decode a complete fresh canonical listening grant before recording. The
 * frozen song publication is immutable; no new guide API or persisted URL. */
export async function prepareDanceCaptureGuide(input: {
  readonly context: DanceCaptureContext;
  readonly signal: AbortSignal;
  readonly assertCurrent: () => void;
}, dependencies: {
  readonly prepareSource?: GuideSourcePreparation;
  readonly createAudioContext?: () => AudioContext;
  readonly fetch?: typeof fetch;
  readonly nowMs?: () => number;
} = {}): Promise<DanceCaptureGuide> {
  const { signal } = input;
  const { session_id: sessionId, terms_hash: termsHash, song_post_id: postId,
    body_start_ms: bodyStartMs, body_end_ms: bodyEndMs } = input.context.session;
  const { canonical_song_start_ms: songStartMs, canonical_song_end_ms: songEndMs } = input.context.reference;
  const current = () => { signal.throwIfAborted(); input.assertCurrent(); };
  current();
  if (![bodyStartMs, bodyEndMs, songStartMs, songEndMs].every(Number.isSafeInteger)
    || bodyStartMs <= 0 || songStartMs < 0 || songEndMs <= songStartMs
    || bodyEndMs - bodyStartMs !== songEndMs - songStartMs) throw new Error("dance_guide_bounds_changed");
  const audio = (dependencies.createAudioContext ?? (() => new AudioContext()))();
  const now = dependencies.nowMs ?? (() => performance.now());
  let disposed = false, started = false, buffer: AudioBuffer | null = null;
  let node: AudioBufferSourceNode | null = null;
  let reportFailure: ((error: Error) => void) | null = null;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", dispose);
    audio.removeEventListener("statechange", stateChanged);
    if (node) { node.onended = null; try { node.stop(); } catch { /* not scheduled */ } node.disconnect(); }
    node = null; buffer = null; reportFailure = null;
    void audio.close().catch(() => {});
  };
  const failed = (error: Error) => { const report = reportFailure; dispose(); report?.(error); };
  const stateChanged = () => { if (started && !disposed && audio.state !== "running") failed(new Error("dance_guide_interrupted")); };
  signal.addEventListener("abort", dispose, { once: true });
  audio.addEventListener("statechange", stateChanged);
  let source: Awaited<ReturnType<GuideSourcePreparation>> | null = null;
  try {
    // Resume is invoked before any await so a caller's explicit gesture can
    // unlock audio. A suspended source never silently becomes a practice take.
    await audio.resume(); current();
    if (disposed || audio.state !== "running") throw new Error("dance_guide_unavailable");
    source = await (dependencies.prepareSource ?? prepareBufferedGuide)(postId, signal); current();
    if (new URL(source.url).protocol !== "blob:") throw new Error("dance_guide_unavailable");
    const response = await (dependencies.fetch ?? fetch)(source.url, { signal, credentials: "omit", redirect: "error" }); current();
    if (!response.ok) throw new Error("dance_guide_unavailable");
    const bytes = await response.arrayBuffer(); current();
    buffer = await audio.decodeAudioData(bytes); current();
    if (disposed || audio.state !== "running" || !Number.isFinite(buffer.duration) || buffer.duration * 1000 < songEndMs) throw new Error("dance_guide_incomplete");
    return Object.freeze({ sessionId, termsHash,
      start(originMs: number, assertCaptureCurrent: () => void, onFailure: (error: Error) => void) {
        current(); assertCaptureCurrent();
        if (disposed || started || !buffer || audio.state !== "running" || !Number.isFinite(originMs)) throw new Error("dance_guide_unavailable");
        const delaySeconds = (originMs + bodyStartMs - now()) / 1000;
        if (delaySeconds <= 0) throw new Error("dance_guide_start_missed");
        started = true; reportFailure = onFailure;
        node = audio.createBufferSource(); node.buffer = buffer; node.playbackRate.value = 1;
        node.connect(audio.destination);
        const startAt = audio.currentTime + delaySeconds;
        const endAt = startAt + (songEndMs - songStartMs) / 1000;
        node.onended = () => {
          if (!disposed && audio.currentTime < endAt - 1 / audio.sampleRate) failed(new Error("dance_guide_interrupted"));
        };
        try { node.start(startAt, songStartMs / 1000, (songEndMs - songStartMs) / 1000); }
        catch (error) { dispose(); throw error; }
      },
      dispose,
    });
  } catch (error) { dispose(); throw error; }
  finally { source?.release(); }
}
