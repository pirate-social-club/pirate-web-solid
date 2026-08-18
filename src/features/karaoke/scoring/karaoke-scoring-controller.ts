/**
 * Phase 5.3 — the karaoke scoring ORCHESTRATOR. This is the single place that
 * coordinates the three already-tested pieces into a live scoring session:
 *
 *   transport  : {@link KaraokeSessionBridgeHandle} (createKaraokeSessionClient)
 *   capture     : a {@link KaraokeScoringCaptureEngine} (KaraokeMicCapture)
 *   lifecycle   : {@link createKaraokeCaptureLifecycle} (anchor/activate ordering)
 *
 * It is framework-agnostic (no React) and fully injectable so it can be unit
 * tested with fakes exactly like the bridge/lifecycle/mic engine. The React hook
 * `use-karaoke-scoring-session` is a thin wrapper that supplies the real browser
 * factories and re-renders on `subscribe`.
 *
 * Playback is owned by the UI (the instrumental <audio>). The orchestrator is
 * DRIVEN by explicit notifications from that player — `noteTime/notePlay/
 * notePause/noteSeek/noteFinish` — rather than sampling, so pause/seek/finish map
 * to precise transport frames and capture epochs.
 *
 * CAPTURE EPOCHS (SPEC §4.3): song time and capture (AudioContext) time only stay
 * aligned while the song is actually playing. So on a LOCAL pause/seek we suspend
 * capture (flush + clear anchor); on resume/seek-while-playing we re-anchor at the
 * current song position and reactivate. These local transitions are serialized on
 * their own chain and only run while the socket is `live` — during a reconnect the
 * transport owns capture suspend/resume itself (SPEC §6).
 */

import type {
  KaraokeClientPhase,
  KaraokeLineScore,
  KaraokeServerEvent,
  KaraokeSessionSummary,
  ScorableKaraokeLine,
} from "../runtime";

import {
  createKaraokeSessionClient,
  type CreateKaraokeSessionClientOptions,
  type KaraokeBridgeError,
  type KaraokeSessionBridgeHandle,
} from "../karaoke-session-bridge";
import {
  createKaraokeCaptureLifecycle,
  type CaptureEngineLike,
} from "../capture/karaoke-capture-lifecycle";

export type KaraokeScoringStatus =
  | "idle"
  | "requesting-mic"
  | "connecting"
  | "reconnecting"
  | "active"
  | "finishing"
  | "ended"
  | "error";

interface KaraokeScoringSimpleError {
  code: string;
  message: string;
}

export interface KaraokeScoringState {
  status: KaraokeScoringStatus;
  /** Underlying transport phase (idle…live…closed/aborted/expired/capture_failed). */
  phase: KaraokeClientPhase;
  /** Finalized line scores, ordered by scoredLineIndex (last write wins per line). */
  lineScores: KaraokeLineScore[];
  /** lineId of the most recently scored line (for transient UI highlight). */
  latestLineId: string | null;
  /** Live (interim) transcript for the line currently being sung; cleared on final. */
  partialTranscript: string;
  /** Final session summary, present once the server emits it. */
  summary: KaraokeSessionSummary | null;
  /** Microphone-specific failure (permission/device), distinct from session errors. */
  micError: KaraokeScoringSimpleError | null;
  /** Session/transport error surfaced to the UI (terminal unless retryable). */
  error: KaraokeScoringSimpleError | null;
}

/** The capture engine surface the orchestrator drives (KaraokeMicCapture satisfies it). */
export interface KaraokeScoringCaptureEngine extends CaptureEngineLike {
  /** Wires the mic graph and acquires permission; begins INACTIVE. Throws on mic failure. */
  start(): Promise<void>;
}

type CreateScoringCaptureEngine = (handlers: {
  onChunk: (pcm16: ArrayBuffer, capturedAtMs: number) => void;
  onError: (error: KaraokeScoringSimpleError) => void;
}) => KaraokeScoringCaptureEngine;

type CreateScoringSessionClient = (
  options: CreateKaraokeSessionClientOptions,
) => KaraokeSessionBridgeHandle;

export interface KaraokeScoringControllerOptions {
  communityId: string;
  postId: string;
  /** Scorable lines (with stable identities) used for line-boundary events. */
  scorableLines: readonly ScorableKaraokeLine[];
  /** Authenticated session creation (adapted from the API client by the hook). */
  createKaraokeSession: CreateKaraokeSessionClientOptions["createKaraokeSession"];
  /** Builds the mic capture engine bound to the orchestrator's chunk/error handlers. */
  createCaptureEngine: CreateScoringCaptureEngine;
  /** Transport factory; defaults to the real network-wired bridge. */
  createSessionClient?: CreateScoringSessionClient;
  /** Min ms between `playback_sync` heartbeats (default 1000). */
  playbackSyncIntervalMs?: number;
  now?: () => number;
}

const DEFAULT_PLAYBACK_SYNC_INTERVAL_MS = 1_000;

function initialState(): KaraokeScoringState {
  return {
    error: null,
    latestLineId: null,
    lineScores: [],
    micError: null,
    partialTranscript: "",
    phase: "idle",
    status: "idle",
    summary: null,
  };
}

/**
 * Maps a transport phase to a coarse UI status. "active" ("Listening…") is only
 * reported while the socket is actually live; once a live session drops, we show
 * "reconnecting" rather than pretending we're still listening.
 */
function statusForPhase(phase: KaraokeClientPhase, hasBeenLive: boolean): KaraokeScoringStatus {
  switch (phase) {
    case "creating":
    case "connecting":
      return hasBeenLive ? "reconnecting" : "connecting";
    case "reconnecting":
      return "reconnecting";
    case "live":
      return "active";
    case "expired":
    case "capture_failed":
    case "aborted":
      return "error";
    case "closed":
      return "ended";
    case "idle":
    default:
      return hasBeenLive ? "ended" : "idle";
  }
}

export interface KaraokeScoringController {
  getState(): KaraokeScoringState;
  subscribe(listener: (state: KaraokeScoringState) => void): () => void;
  /** Begins a session: acquires the mic, then creates+connects the transport. */
  start(startedAtAudioMs: number): Promise<void>;
  /** Reports the current SONG-time position (ms); throttled sync + line-boundary detection. */
  noteTime(songMs: number): void;
  /** The instrumental started/resumed playing at `songMs`. */
  notePlay(songMs: number): void;
  /** The instrumental paused at `songMs`. */
  notePause(songMs: number): void;
  /** The instrumental was seeked to `songMs`. */
  noteSeek(songMs: number): void;
  /** The instrumental reached the end at `songMs`. */
  noteFinish(songMs: number): void;
  /** Graceful client-initiated close (no summary expected after). */
  stop(): void;
  /** Hard abort with a reason code. */
  abort(code: string): void;
  /** Idempotent teardown (close session + stop mic); safe to call on unmount. */
  dispose(): void;
}

export function createKaraokeScoringController(
  options: KaraokeScoringControllerOptions,
): KaraokeScoringController {
  const now = options.now ?? (() => Date.now());
  const playbackSyncIntervalMs = options.playbackSyncIntervalMs ?? DEFAULT_PLAYBACK_SYNC_INTERVAL_MS;
  const createSessionClient = options.createSessionClient ?? createKaraokeSessionClient;
  const scorableLines = options.scorableLines;

  const listeners = new Set<(state: KaraokeScoringState) => void>();
  let state = initialState();

  let handle: KaraokeSessionBridgeHandle | null = null;
  let engine: KaraokeScoringCaptureEngine | null = null;
  let lifecycle: ReturnType<typeof createKaraokeCaptureLifecycle> | null = null;

  let songMs = 0;
  let hasBeenLive = false;
  let activatedInitial = false;
  let isPlaying = false;
  let disposed = false;
  let lastSyncAtMs = Number.NEGATIVE_INFINITY;
  let lastBoundaryLineId: string | null = null;

  // Local (non-reconnect) capture transitions are serialized so pause/resume/seek
  // can never overlap each other.
  let localChain: Promise<void> = Promise.resolve();

  function emit(): void {
    const snapshot = state;
    for (const listener of listeners) listener(snapshot);
  }

  function setState(patch: Partial<KaraokeScoringState>): void {
    state = { ...state, ...patch };
    emit();
  }

  function enqueueLocal(task: () => Promise<void>): void {
    localChain = localChain.then(task, task).catch(() => undefined);
  }

  /** Re-anchor + reactivate capture for a local resume/seek-while-playing (live only). */
  function localResume(): void {
    if (!lifecycle || handle?.getPhase() !== "live") return;
    enqueueLocal(async () => {
      if (handle?.getPhase() !== "live") return;
      await lifecycle!.resumeCapture();
    });
  }

  /** Flush + clear anchor for a local pause/seek (live only). */
  function localSuspend(): void {
    if (!lifecycle || handle?.getPhase() !== "live") return;
    enqueueLocal(async () => {
      await lifecycle!.suspendCapture();
    });
  }

  function recordLineScore(score: KaraokeLineScore): void {
    const next = state.lineScores.filter((existing) => existing.lineId !== score.lineId);
    next.push(score);
    next.sort((a, b) => a.scoredLineIndex - b.scoredLineIndex);
    setState({ latestLineId: score.lineId, lineScores: next, partialTranscript: "" });
  }

  function handlePhaseChange(phase: KaraokeClientPhase): void {
    if (phase === "live") {
      hasBeenLive = true;
      // Initial activation is owned by the orchestrator (SPEC §4.3): set the
      // anchor + activate the mic the first time the socket reaches live.
      // Reconnect re-activation is owned by the transport's resumeCapture hook.
      if (!activatedInitial && lifecycle) {
        activatedInitial = true;
        enqueueLocal(async () => {
          if (handle?.getPhase() !== "live") return;
          await lifecycle!.activateInitial();
        });
      }
    }
    setState({ phase, status: statusForPhase(phase, hasBeenLive) });
  }

  function handleBridgeError(error: KaraokeBridgeError): void {
    // Non-retryable creation/transport failures are terminal; retryable ones are
    // surfaced but the transport keeps reconnecting, so don't flip to a terminal UI.
    setState({
      error: { code: error.code, message: error.message },
      ...(error.retryable ? {} : { status: "error" }),
    });
  }

  function handleServerEvent(event: KaraokeServerEvent): void {
    switch (event.type) {
      case "stt_partial":
        setState({ partialTranscript: event.text });
        return;
      case "stt_final":
        // The matching line_score arrives separately; clear the interim text.
        setState({ partialTranscript: "" });
        return;
      case "line_score":
        recordLineScore(event.result);
        return;
      case "summary":
        setState({ status: "ended", summary: event.summary });
        return;
      case "session_error":
        // Transient scoring hiccups (a line-boundary the server didn't expect, or
        // a brief not-recording window) are NOT terminal — the stream keeps going.
        // Don't flip to the error UI / "Try again"; just ignore them.
        if (event.code === "line_identity_mismatch" || event.code === "session_not_recording") {
          return;
        }
        // Surface the provider/connect detail, not just the code. The server
        // attaches the real cause (e.g. elevenlabs_stt_token_mint_failed_401) in
        // `message`; the code alone (session_aborted) hides it.
        console.error("[karaoke] session_error", { code: event.code, message: event.message });
        setState({
          error: {
            code: event.code,
            message: event.message ? `session error: ${event.code} — ${event.message}` : `session error: ${event.code}`,
          },
          status: "error",
        });
        return;
      default:
        return;
    }
  }

  function handleCaptureError(error: KaraokeScoringSimpleError): void {
    setState({ micError: error });
    // A device failure mid-session (e.g. track ended) — the engine stops itself;
    // abort the transport so the session ends cleanly rather than streaming silence.
    if (hasBeenLive && handle && handle.getPhase() === "live") {
      handle.abort("karaoke_mic_lost");
    }
  }

  function currentLineIdentity(at: number) {
    const line = scorableLines.find((candidate) => at >= candidate.startMs && at < candidate.endMs);
    return line ?? null;
  }

  return {
    abort: (code) => {
      handle?.abort(code);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      // close() drives the transport's teardownCapture (mic stop) deterministically.
      // If the session never started, stop the engine directly.
      if (handle) handle.close();
      else void engine?.stop();
    },
    getState: () => state,
    noteFinish: (nextSongMs) => {
      songMs = Math.max(0, nextSongMs);
      if (!handle || handle.getPhase() !== "live") return;
      setState({ status: "finishing" });
      handle.finish(songMs);
    },
    notePause: (nextSongMs) => {
      songMs = Math.max(0, nextSongMs);
      isPlaying = false;
      if (!handle || handle.getPhase() !== "live") return;
      // Send the pause frame first, then stop folding paused capture-clock time
      // into song time (SPEC §4.3).
      handle.pause(songMs);
      localSuspend();
    },
    notePlay: (nextSongMs) => {
      songMs = Math.max(0, nextSongMs);
      isPlaying = true;
      if (!handle || handle.getPhase() !== "live") return;
      // Re-anchor at the current song position + reactivate, then announce resume.
      localResume();
      handle.resume(songMs);
    },
    noteSeek: (nextSongMs) => {
      songMs = Math.max(0, nextSongMs);
      lastBoundaryLineId = null; // re-fire boundary for the line we land in
      if (!handle || handle.getPhase() !== "live") return;
      handle.seek(songMs);
      // A seek decouples capture time from song time → new epoch. While playing,
      // re-anchor; while paused the anchor is already cleared (resume re-anchors).
      if (isPlaying) {
        localSuspend();
        localResume();
      }
    },
    noteTime: (nextSongMs) => {
      songMs = Math.max(0, nextSongMs);
      if (!handle || handle.getPhase() !== "live") return;
      // Throttled heartbeat so the server tracks playback position/rate.
      const t = now();
      if (t - lastSyncAtMs >= playbackSyncIntervalMs) {
        lastSyncAtMs = t;
        handle.playbackSync(songMs, isPlaying);
      }
      // Line-boundary events on entering a new line (windows server-side scoring).
      const line = currentLineIdentity(songMs);
      if (line && line.lineId !== lastBoundaryLineId) {
        lastBoundaryLineId = line.lineId;
        handle.lineBoundary(
          { lineId: line.lineId, lineIndex: line.lineIndex, scoredLineIndex: line.scoredLineIndex },
          songMs,
        );
      }
    },
    start: async (startedAtAudioMs) => {
      if (disposed) return;
      if (state.status !== "idle" && state.status !== "ended" && state.status !== "error") return;
      songMs = Math.max(0, startedAtAudioMs);
      isPlaying = true;
      hasBeenLive = false;
      activatedInitial = false;
      lastBoundaryLineId = null;
      lastSyncAtMs = Number.NEGATIVE_INFINITY;
      setState({ error: null, micError: null, status: "requesting-mic", summary: null });

      // 1. Acquire the mic FIRST so a permission/device failure never leaves a
      //    server-side session orphaned.
      const captureEngine = options.createCaptureEngine({
        onChunk: (pcm16, capturedAtMs) => handle?.pushAudio(pcm16, capturedAtMs),
        onError: handleCaptureError,
      });
      engine = captureEngine;
      try {
        await captureEngine.start();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code = (error as { code?: string }).code ?? "karaoke_mic_failed";
        setState({ micError: { code, message }, status: "error" });
        void captureEngine.stop();
        engine = null;
        return;
      }
      if (disposed) {
        void captureEngine.stop();
        engine = null;
        return;
      }

      // 2. Wire the capture lifecycle to the transport's reconnect hooks.
      const captureLifecycle = createKaraokeCaptureLifecycle({
        capture: captureEngine,
        getPlaybackRate: () => 1,
        getSongMs: () => songMs,
        onError: (error) => handleCaptureError(error),
      });
      lifecycle = captureLifecycle;

      // 3. Build the network-wired transport with capture hooks attached.
      const sessionClient = createSessionClient({
        communityId: options.communityId,
        createKaraokeSession: options.createKaraokeSession,
        onError: handleBridgeError,
        onPhaseChange: handlePhaseChange,
        onServerEvent: handleServerEvent,
        postId: options.postId,
        resumeCapture: () => captureLifecycle.resumeCapture(),
        suspendCapture: () => captureLifecycle.suspendCapture(),
        teardownCapture: () => captureLifecycle.teardownCapture(),
      });
      handle = sessionClient;
      captureLifecycle.attachClient(sessionClient);

      setState({ status: "connecting" });
      await sessionClient.start({ startedAtAudioMs: songMs });
    },
    stop: () => {
      handle?.close();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
