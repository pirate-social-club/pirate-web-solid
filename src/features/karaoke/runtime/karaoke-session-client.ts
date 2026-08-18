import { encodeKaraokeBinaryFrame } from "./binary-codec";
import { toKaraokeSessionDescriptor, type ApiKaraokeSession } from "./api-contracts";
import {
  KARAOKE_TRANSPORT_PROTOCOL_VERSION,
  type KaraokeClientEvent,
  type KaraokeLineIdentity,
  type KaraokeServerEvent,
} from "./transport";

/** The fields of the session-creation response the transport needs. */
export interface KaraokeSessionDescriptor {
  id: string;
  /** Stable across reconnects: replaying creation refreshes the token, same attempt. */
  attempt: string;
  websocketUrl: string;
  /** Epoch seconds. */
  tokenExpiresAt: number;
  /** Epoch seconds. */
  sessionExpiresAt: number;
  protocolVersion: typeof KARAOKE_TRANSPORT_PROTOCOL_VERSION;
}

/** Minimal WebSocket surface (injectable so tests can drive a fake socket). */
export interface KaraokeClientSocket {
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: string | ArrayBuffer }) => void): void;
  addEventListener(type: "close", listener: (event: { code: number; reason: string }) => void): void;
  addEventListener(type: "error", listener: (event: unknown) => void): void;
}

export type KaraokeClientPhase =
  | "idle"
  | "creating"
  | "connecting"
  | "live"
  | "reconnecting"
  | "expired"
  | "closed"
  | "aborted"
  /**
   * A capture transition (suspend or resume) failed, so the session cannot
   * safely stream: the socket is closed and the anchor cleared. Recoverable —
   * the orchestrator may start a NEW attempt — but never silently live.
   */
  | "capture_failed";

export interface KaraokeSessionClientOptions {
  /**
   * Creates (or replays) a karaoke session. Replaying with the SAME
   * idempotencyKey refreshes the capability/token but returns the same attempt.
   */
  createSession: (input: { idempotencyKey: string }) => Promise<KaraokeSessionDescriptor | ApiKaraokeSession>;
  /** Opens a socket to the descriptor's websocketUrl. */
  connect: (url: string) => KaraokeClientSocket;
  onServerEvent: (event: KaraokeServerEvent) => void;
  onPhaseChange?: (phase: KaraokeClientPhase) => void;
  onError?: (error: { code: string; message: string }) => void;
  now?: () => number;
  generateIdempotencyKey?: () => string;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Refresh the capability this many ms before token expiry. */
  tokenRefreshLeadMs?: number;
  /** Base delay before reconnect attempts; subsequent attempts back off exponentially. */
  reconnectDelayMs?: number;
  /** Maximum reconnect attempts before the session aborts. Default 5. */
  maxReconnectAttempts?: number;
  /** Maximum reconnect delay after backoff. Default 2000ms. */
  maxReconnectDelayMs?: number;
  /** Max ms to wait for a WebSocket `open` event before treating connect as failed. */
  socketConnectTimeoutMs?: number;
  sampleRate?: 16000;
  /**
   * Reconnect capture hooks (SPEC §6). When a live socket is lost (unexpected
   * close or token refresh), the transport clears its anchor and awaits
   * `suspendCapture()` (the web layer flushes + deactivates the mic engine).
   * After the new socket reaches `live`, it awaits `resumeCapture(descriptor)`
   * (the web layer sets a fresh anchor + reactivates). These are async because
   * `onPhaseChange` is synchronous/observational and cannot enforce ordering.
   */
  suspendCapture?: () => Promise<void>;
  resumeCapture?: (descriptor: KaraokeSessionDescriptor) => Promise<void>;
  /**
   * Full capture teardown (stop tracks, close AudioContext) invoked on terminal
   * shutdown (`close`/`abort`) and on a `capture_failed` transition, so the
   * microphone never outlives the session even if the UI forgets to clean up.
   * MUST be idempotent (it may be called after the orchestrator already tore down).
   */
  teardownCapture?: () => void | Promise<void>;
  /**
   * Max ms terminal teardown waits for an in-flight suspend (flush) before
   * force-invoking `teardownCapture` anyway, so a hung `suspendCapture` can never
   * block the full mic stop. Default 2000.
   */
  captureTeardownTimeoutMs?: number;
}

/** Capture→song mapping anchor (SPEC §4.1). */
export interface KaraokeCaptureAnchor {
  /** Capture clock (AudioContext.currentTime × 1000) at the anchor. */
  captureMs: number;
  /** Song-time position (ms) corresponding to captureMs. */
  songMs: number;
  /** Playback speed at the anchor (finite, > 0). */
  playbackRate: number;
}

const DEFAULT_RECONNECT_DELAY_MS = 250;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 2_000;
const DEFAULT_SOCKET_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_CAPTURE_TEARDOWN_TIMEOUT_MS = 2_000;
const SESSION_EXPIRED_CLOSE_CODE = 4001;
const SESSION_CONFIGURATION_CLOSE_CODE = 4002;

function isServerEvent(value: unknown): value is KaraokeServerEvent {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.protocolVersion !== KARAOKE_TRANSPORT_PROTOCOL_VERSION) return false;
  if (typeof record.sequence !== "number") return false;
  return (
    record.type === "stt_partial"
    || record.type === "stt_final"
    || record.type === "line_score"
    || record.type === "summary"
    || record.type === "session_error"
  );
}

/**
 * Drives the client side of a karaoke scoring session: session creation with a
 * stable idempotency key, the gateway WebSocket lifecycle, protocol sequencing
 * (client events + binary audio share one monotonic counter), binary encoding,
 * token refresh, reconnect, and typed server-event delivery.
 *
 * Reconnect contract: replaying session creation refreshes the capability and
 * returns the SAME attempt. PCM is NEVER replayed after a disconnect (retention
 * is not_stored) — capture resumes with a fresh STT generation and the server's
 * orphan handling marks any in-flight line uncertain.
 */
export class KaraokeSessionClient {
  private readonly options: KaraokeSessionClientOptions;
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectAttempts: number;
  private readonly maxReconnectDelayMs: number;
  private readonly socketConnectTimeoutMs: number;
  private readonly sampleRate: 16000;
  private readonly captureTeardownTimeoutMs: number;

  private phase: KaraokeClientPhase = "idle";
  private idempotencyKey: string | null = null;
  private descriptor: KaraokeSessionDescriptor | null = null;
  private socket: KaraokeClientSocket | null = null;
  private startInput: { postId: string; startedAtAudioMs: number } | null = null;
  private sequence = 0; // shared by client events + binary frames; persists across reconnects
  private chunkId = 0;
  private refreshTimer: unknown = null;
  private socketConnectTimer: unknown = null;
  private reconnectAttempts = 0;
  private reconnectTimer: unknown = null;
  // Covers the full create→socket-open reconnect attempt. The timer is cleared
  // before creation begins, so it cannot serve as the in-flight guard itself.
  private reconnectAttemptInFlight = false;
  private anchor: KaraokeCaptureAnchor | null = null;
  private lastCapturedAtMs: number | null = null; // monotonic guard within the current anchor epoch
  // Serialized capture-transition chain: suspend and resume NEVER overlap. A
  // generation counter (bumped on each suspend request) lets a stale resume detect
  // that a newer suspension superseded it.
  private captureChain: Promise<unknown> = Promise.resolve();
  private captureGeneration = 0;
  private captureSuspendPending = false; // a suspend is enqueued/running for the current gap (coalesce)
  private captureSuspendOk = true; // did the latest suspend flush/deactivate succeed
  private captureTeardown: Promise<void> | null = null; // cached so teardown runs at most once

  constructor(options: KaraokeSessionClientOptions) {
    this.options = options;
    this.now = options.now ?? (() => Date.now());
    this.setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.reconnectDelayMs = options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS;
    this.socketConnectTimeoutMs = options.socketConnectTimeoutMs ?? DEFAULT_SOCKET_CONNECT_TIMEOUT_MS;
    this.sampleRate = options.sampleRate ?? 16000;
    this.captureTeardownTimeoutMs = options.captureTeardownTimeoutMs ?? DEFAULT_CAPTURE_TEARDOWN_TIMEOUT_MS;
  }

  getPhase(): KaraokeClientPhase {
    return this.phase;
  }

  /** Begins the session: create (stable idempotency key) → connect → send start. */
  async start(input: { postId: string; startedAtAudioMs?: number }): Promise<void> {
    if (this.phase !== "idle") return;
    this.startInput = { postId: input.postId, startedAtAudioMs: input.startedAtAudioMs ?? 0 };
    this.idempotencyKey = this.options.generateIdempotencyKey?.() ?? this.makeIdempotencyKey();
    await this.createAndConnect(true);
  }

  /**
   * Sets the capture→song mapping anchor (SPEC §4.1). All subsequent `pushAudio`
   * frames map their capture timestamps to song time through this anchor until it
   * is replaced or cleared. A new anchor is required whenever song time and
   * capture time decouple (pause/seek/resume/rate change) — each such transition
   * is a new epoch.
   */
  setCaptureAnchor(anchor: KaraokeCaptureAnchor): void {
    if (!Number.isFinite(anchor.captureMs)) {
      throw new RangeError("karaoke anchor captureMs must be finite");
    }
    if (!Number.isFinite(anchor.songMs) || anchor.songMs < 0) {
      throw new RangeError("karaoke anchor songMs must be finite and non-negative");
    }
    if (!Number.isFinite(anchor.playbackRate) || anchor.playbackRate <= 0) {
      throw new RangeError("karaoke anchor playbackRate must be finite and > 0");
    }
    this.anchor = { captureMs: anchor.captureMs, playbackRate: anchor.playbackRate, songMs: anchor.songMs };
    // New epoch: reset the monotonic guard so a legitimate (e.g. backward-seek)
    // re-anchor is accepted even though its capture timestamps regress.
    this.lastCapturedAtMs = null;
  }

  /** Clears the anchor; audio pushed while unanchored is dropped (SPEC §4.5). */
  clearCaptureAnchor(): void {
    this.anchor = null;
    this.lastCapturedAtMs = null;
  }

  /**
   * Feeds a continuous microphone PCM16 mono buffer captured at `capturedAtMs`
   * (capture clock, ms). Song-time bounds are derived from the current anchor
   * (SPEC §4.2), keeping capture timing separate from playback timing. Dropped
   * silently unless the session is live AND an anchor exists.
   */
  pushAudio(pcm16: ArrayBuffer, capturedAtMs: number): void {
    if (this.phase !== "live" || !this.socket || !this.descriptor) return;
    const anchor = this.anchor;
    if (!anchor) return; // unanchored → dropped (anchored timing is mandatory)
    if (!Number.isFinite(capturedAtMs)) return;
    // Reject pre-anchor capture (it would map to song time before the anchor) and
    // any in-epoch regression (non-monotonic). A legitimate backward seek must set
    // a NEW anchor first, which resets lastCapturedAtMs above.
    if (capturedAtMs < anchor.captureMs) return;
    if (this.lastCapturedAtMs !== null && capturedAtMs < this.lastCapturedAtMs) return;
    const durationMs = (pcm16.byteLength / 2 / this.sampleRate) * 1000;
    const songEndMs = anchor.songMs + (capturedAtMs - anchor.captureMs) * anchor.playbackRate;
    if (!Number.isFinite(songEndMs) || songEndMs < 0) return;
    const songStartMs = Math.max(0, songEndMs - durationMs * anchor.playbackRate);
    this.lastCapturedAtMs = capturedAtMs;
    this.sendBinary(pcm16, Math.round(songStartMs), Math.round(songEndMs));
  }

  private sendBinary(pcm16: ArrayBuffer, songStartMs: number, songEndMs: number): void {
    if (!this.socket || !this.descriptor) return;
    // The binary codec requires an ordered uint32 song range; a huge songMs /
    // playbackRate / capture delta could otherwise make encode throw. Validate and
    // drop+report instead of letting a RangeError escape.
    if (
      !Number.isInteger(songStartMs)
      || !Number.isInteger(songEndMs)
      || songStartMs < 0
      || songEndMs > 0xffff_ffff
      || songStartMs > songEndMs
    ) {
      this.options.onError?.({ code: "karaoke_audio_bounds_invalid", message: `song bounds out of uint32 range: ${songStartMs}..${songEndMs}` });
      return;
    }
    this.chunkId += 1;
    const frame = encodeKaraokeBinaryFrame({
      attemptId: this.descriptor.attempt,
      chunkId: this.chunkId,
      pcm16,
      protocolVersion: KARAOKE_TRANSPORT_PROTOCOL_VERSION,
      sampleRate: this.sampleRate,
      sequence: this.nextSequence(),
      sessionId: this.descriptor.id,
      songEndMs,
      songStartMs,
      type: "audio_chunk",
    });
    this.socket.send(frame);
  }

  playbackSync(audioTimeMs: number, playing: boolean): void {
    this.sendClientEvent({ audioTimeMs, playing, type: "playback_sync" });
  }
  pause(audioTimeMs: number): void {
    this.sendClientEvent({ audioTimeMs, type: "pause" });
  }
  resume(audioTimeMs: number): void {
    this.sendClientEvent({ audioTimeMs, type: "resume" });
  }
  seek(audioTimeMs: number): void {
    this.sendClientEvent({ audioTimeMs, type: "seek" });
  }
  lineBoundary(line: KaraokeLineIdentity, audioTimeMs: number): void {
    this.sendClientEvent({ audioTimeMs, type: "line_boundary", ...line });
  }
  finish(audioTimeMs: number): void {
    this.sendClientEvent({ audioTimeMs, type: "finish" });
  }
  abort(code: string): void {
    if (this.isTerminal()) return; // preserve the original terminal reason
    this.sendClientEvent({ code, type: "abort" });
    this.shutdown("aborted");
  }

  /** Client-initiated close (no reconnect). No-op once terminal. */
  close(): void {
    if (this.isTerminal()) return; // preserve the original terminal reason
    this.shutdown("closed");
  }

  private makeIdempotencyKey(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `karaoke-${this.now()}-${Math.floor((this.now() % 1) * 1e9)}`;
  }

  private nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  private setPhase(phase: KaraokeClientPhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.options.onPhaseChange?.(phase);
  }

  private sendClientEvent(
    body:
      | Omit<Extract<KaraokeClientEvent, { type: "playback_sync" }>, keyof KaraokeClientEnvelopeFields>
      | Omit<Extract<KaraokeClientEvent, { type: "pause" | "resume" | "seek" | "finish" }>, keyof KaraokeClientEnvelopeFields>
      | Omit<Extract<KaraokeClientEvent, { type: "line_boundary" }>, keyof KaraokeClientEnvelopeFields>
      | Omit<Extract<KaraokeClientEvent, { type: "abort" }>, keyof KaraokeClientEnvelopeFields>,
  ): void {
    if (this.phase !== "live" || !this.socket || !this.descriptor) return;
    const event = {
      attemptId: this.descriptor.attempt,
      protocolVersion: KARAOKE_TRANSPORT_PROTOCOL_VERSION,
      sequence: this.nextSequence(),
      sessionId: this.descriptor.id,
      ...body,
    } as KaraokeClientEvent;
    this.socket.send(JSON.stringify(event));
  }

  private async createAndConnect(sendStart: boolean): Promise<void> {
    if (!this.idempotencyKey) return;
    this.setPhase(sendStart ? "creating" : "reconnecting");
    let descriptor: KaraokeSessionDescriptor;
    try {
      const session = await this.options.createSession({ idempotencyKey: this.idempotencyKey });
      descriptor = "protocol_version" in session
        ? toKaraokeSessionDescriptor(session)
        : session;
    } catch (error) {
      if (!sendStart) this.reconnectAttemptInFlight = false;
      this.options.onError?.({ code: "karaoke_create_failed", message: stringifyError(error) });
      this.scheduleReconnect();
      return;
    }
    if (this.isTerminal()) return;
    this.descriptor = descriptor;
    this.setPhase("connecting");
    this.openSocket(sendStart);
  }

  private openSocket(sendStart: boolean): void {
    if (!this.descriptor) return;
    let opened = false;
    let socket: KaraokeClientSocket;
    try {
      socket = this.options.connect(this.descriptor.websocketUrl);
    } catch (error) {
      this.options.onError?.({ code: "karaoke_socket_open_failed", message: stringifyError(error) });
      this.shutdown("aborted");
      return;
    }
    this.socket = socket;
    this.clearSocketConnectTimer();
    if (Number.isFinite(this.socketConnectTimeoutMs) && this.socketConnectTimeoutMs > 0) {
      this.socketConnectTimer = this.setTimer(() => {
        if (this.socket !== socket || opened || this.isTerminal()) return;
        this.options.onError?.({ code: "karaoke_socket_connect_timeout", message: "Karaoke WebSocket did not open" });
        this.shutdown("aborted");
      }, this.socketConnectTimeoutMs);
    }
    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      opened = true;
      this.clearSocketConnectTimer();
      this.setPhase("live");
      this.reconnectAttempts = 0;
      this.reconnectAttemptInFlight = false;
      // Send `start` only on the initial connection. On reconnect the server's
      // DO is already recording (restored); resume by streaming fresh audio —
      // never re-send start and never replay PCM.
      if (sendStart && this.startInput) {
        this.socket.send(JSON.stringify({
          attemptId: this.descriptor!.attempt,
          postId: this.startInput.postId,
          protocolVersion: KARAOKE_TRANSPORT_PROTOCOL_VERSION,
          sequence: this.nextSequence(),
          sessionId: this.descriptor!.id,
          startedAtAudioMs: this.startInput.startedAtAudioMs,
          type: "start",
        } satisfies KaraokeClientEvent));
      } else {
        // Reconnect: resume capture (set a fresh anchor + reactivate) only after
        // the suspend transition has completed and THIS socket is still live (§6).
        void this.resumeCaptureAfterReconnect(socket);
      }
      // NOTE: no proactive token refresh. The server never re-checks the gateway
      // token on an established socket (rejectExpiredSocket gates on session
      // expiry, ~60min; the token is verified only at the WS handshake). The old
      // proactive refresh closed the live socket every ~50s to "refresh" — but
      // createSession only rotates an ALREADY-expired token (responseFromRecord),
      // so it churned (close→reconnect→same token→re-fire) producing a ~13s
      // grading outage every token lifetime. A genuine drop reconnects via
      // handleUnexpectedClose→createSession, which rotates the (by-then expired)
      // token. So the live socket needs no refresh; do nothing here.
    });
    socket.addEventListener("message", (messageEvent) => {
      if (this.socket !== socket) return;
      if (typeof messageEvent.data !== "string") return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(messageEvent.data);
      } catch {
        return;
      }
      if (isServerEvent(parsed)) this.options.onServerEvent(parsed);
    });
    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) return;
      this.clearSocketConnectTimer();
      if (!opened && (event.code === SESSION_EXPIRED_CLOSE_CODE || event.code === SESSION_CONFIGURATION_CLOSE_CODE)) {
        this.socket = null;
        this.handleUnexpectedClose(event.code);
        return;
      }
      if (!opened) {
        this.options.onError?.({
          code: "karaoke_socket_closed_before_open",
          message: `Karaoke WebSocket closed before opening${event?.code ? ` (${event.code})` : ""}`,
        });
        this.shutdown("aborted");
        return;
      }
      this.socket = null;
      this.handleUnexpectedClose(event.code);
    });
    socket.addEventListener("error", () => {
      if (this.socket !== socket) return;
      if (!opened) {
        this.clearSocketConnectTimer();
        this.options.onError?.({ code: "karaoke_socket_error", message: "Karaoke WebSocket failed before opening" });
        this.shutdown("aborted");
        return;
      }
      this.options.onError?.({ code: "karaoke_socket_error", message: "WebSocket error" });
    });
  }

  private handleUnexpectedClose(closeCode: number): void {
    if (this.isTerminal()) return;
    // Suspend capture on EVERY live-socket loss, before deciding expired vs.
    // reconnect — otherwise an expired session leaves the mic engine active.
    this.requestCaptureSuspension();
    this.clearTokenRefresh();
    if (closeCode === SESSION_EXPIRED_CLOSE_CODE) {
      this.setPhase("expired");
      void this.teardownCaptureOnce();
      return;
    }
    if (closeCode === SESSION_CONFIGURATION_CLOSE_CODE) {
      this.options.onError?.({
        code: "karaoke_stt_unconfigured",
        message: "Karaoke scoring is not configured for this community",
      });
      this.shutdown("aborted");
      return;
    }
    if (this.descriptor && this.now() >= this.descriptor.sessionExpiresAt * 1000) {
      this.setPhase("expired");
      // Expiry is terminal — release the mic fully (teardown awaits the flush).
      void this.teardownCaptureOnce();
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.reconnectAttemptInFlight || this.isTerminal()) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      const attemptsLabel = `${this.maxReconnectAttempts} reconnect attempt${this.maxReconnectAttempts === 1 ? "" : "s"}`;
      this.options.onError?.({
        code: "karaoke_reconnect_exhausted",
        message: `Karaoke connection failed after ${attemptsLabel}`,
      });
      this.shutdown("aborted");
      return;
    }
    const delayMs = Math.min(
      this.reconnectDelayMs * (2 ** this.reconnectAttempts),
      this.maxReconnectDelayMs,
    );
    this.reconnectAttempts += 1;
    this.setPhase("reconnecting");
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = null;
      if (this.isTerminal()) return;
      this.reconnectAttemptInFlight = true;
      // Replay creation with the SAME idempotency key → refreshed token, same
      // attempt. Do not re-send start; do not replay PCM.
      void this.createAndConnect(false);
    }, delayMs);
  }

  /** Appends a capture transition to the serialized chain so none ever overlap. */
  private enqueueCaptureTransition(task: () => Promise<void>): Promise<void> {
    const run = this.captureChain.then(task, task); // run regardless of prior outcome
    this.captureChain = run.catch(() => undefined); // keep the chain from rejecting
    return run;
  }

  /**
   * Requests capture suspension on a live-socket loss. Clears the anchor at once,
   * bumps the generation (so any in-flight resume detects supersession), and
   * enqueues ONE serialized `suspendCapture` per gap (coalesced).
   */
  private requestCaptureSuspension(): void {
    this.clearCaptureAnchor();
    this.captureGeneration += 1;
    if (this.captureSuspendPending) return; // one suspend per gap
    if (!this.options.suspendCapture) return;
    this.captureSuspendPending = true;
    this.captureSuspendOk = false;
    void this.enqueueCaptureTransition(async () => {
      try {
        await this.options.suspendCapture!();
        this.captureSuspendOk = true;
      } catch (error) {
        this.captureSuspendOk = false;
        this.options.onError?.({ code: "karaoke_capture_suspend_failed", message: stringifyError(error) });
      } finally {
        this.captureSuspendPending = false;
      }
    });
  }

  /**
   * Enqueues a serialized resume for `socket` (runs strictly after the gap's
   * suspend). Skips if superseded (newer generation), not the current socket, or
   * no longer live — and a resume that activates just as a newer suspension begins
   * clears its anchor; the trailing serialized suspend then deactivates it.
   */
  private resumeCaptureAfterReconnect(socket: KaraokeClientSocket): void {
    const generation = this.captureGeneration;
    void this.enqueueCaptureTransition(async () => {
      if (this.socket !== socket || this.phase !== "live" || !this.descriptor) return;
      if (generation !== this.captureGeneration) return; // a newer suspension superseded this resume
      if (!this.captureSuspendOk) {
        // The prior epoch may never have flushed — resuming would defeat the
        // transition guarantee. Fail the capture transition instead.
        this.failCaptureTransition();
        return;
      }
      if (!this.options.resumeCapture) return;
      const descriptor = this.descriptor;
      try {
        await this.options.resumeCapture(descriptor);
        // If a newer suspension began (or the socket changed) WHILE resuming, the
        // anchor it set is stale — drop it. The trailing serialized suspend (queued
        // after this task) deactivates whatever was activated, so we never end
        // active under a newer suspension.
        if (this.socket !== socket || this.phase !== "live" || generation !== this.captureGeneration) {
          this.clearCaptureAnchor();
        }
      } catch (error) {
        this.options.onError?.({ code: "karaoke_capture_resume_failed", message: stringifyError(error) });
        // Don't leave the client silently live with audio dropped under a cleared
        // anchor — move to the recoverable capture_failed phase (socket closed).
        if (this.socket === socket) this.failCaptureTransition();
      }
    });
  }

  private isTerminal(): boolean {
    return (
      this.phase === "closed"
      || this.phase === "aborted"
      || this.phase === "capture_failed"
      || this.phase === "expired"
    );
  }

  /**
   * A capture transition failed: stop streaming deterministically. Closes the
   * socket, clears the anchor, tears down capture, and moves to the recoverable
   * `capture_failed` phase. The orchestrator may start a NEW attempt.
   */
  private failCaptureTransition(): void {
    if (this.isTerminal()) return;
    this.reconnectAttemptInFlight = false;
    this.clearReconnectTimer();
    this.clearTokenRefresh();
    this.clearCaptureAnchor();
    const socket = this.socket;
    this.socket = null;
    try {
      socket?.close(1000, "karaoke_capture_failed");
    } catch {
      // best-effort
    }
    void this.teardownCaptureOnce();
    this.setPhase("capture_failed");
  }

  /** Resolves after `ms` via the injected timer (clearable so it never leaks). */
  private boundedWait(promise: Promise<unknown>, ms: number): Promise<void> {
    let handle: unknown;
    const timeout = new Promise<void>((resolve) => {
      handle = this.setTimer(resolve, ms);
    });
    return Promise.race([promise.then(() => undefined, () => undefined), timeout])
      .finally(() => this.clearTimer(handle));
  }

  /**
   * Invokes `teardownCapture` AT MOST ONCE across all competing terminal paths
   * (close/abort/expired/capture_failed), caching the promise so orchestration can
   * await full microphone release before starting a replacement attempt. It waits
   * for any in-flight suspend (flush) but only up to `captureTeardownTimeoutMs`, so
   * a hung `suspendCapture` can NEVER block the full stop. Failures reported once.
   */
  private teardownCaptureOnce(): Promise<void> {
    if (this.captureTeardown) return this.captureTeardown;
    // Supersede any pending/in-flight resume so it cannot (re)activate after the
    // stop: a resume blocked in resumeCapture() will, on completion, see the bumped
    // generation and drop its anchor instead of staying active.
    this.captureGeneration += 1;
    let stopped = false;
    const stop = async (): Promise<void> => {
      if (stopped) return; // teardownCapture runs at most once across both paths
      stopped = true;
      try {
        await this.options.teardownCapture?.();
      } catch (error) {
        this.options.onError?.({ code: "karaoke_capture_teardown_failed", message: stringifyError(error) });
      }
    };
    // Preferred: run the stop ON the serialized chain, AFTER any in-flight resume,
    // so an explicit terminal shutdown can't stop-then-be-reactivated by a resume.
    const chainedStop = this.enqueueCaptureTransition(stop);
    // Fallback: if the chain is hung (a never-resolving suspend/resume), force the
    // stop after the bounded timeout anyway — teardown must never block forever.
    this.captureTeardown = (async () => {
      await this.boundedWait(chainedStop, this.captureTeardownTimeoutMs);
      await stop(); // no-op if the chained stop already ran
    })();
    return this.captureTeardown;
  }

  private clearTokenRefresh(): void {
    if (this.refreshTimer !== null) {
      this.clearTimer(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private clearSocketConnectTimer(): void {
    if (this.socketConnectTimer !== null) {
      this.clearTimer(this.socketConnectTimer);
      this.socketConnectTimer = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      this.clearTimer(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private shutdown(phase: "closed" | "aborted"): void {
    this.clearTokenRefresh();
    this.clearSocketConnectTimer();
    this.clearReconnectTimer();
    this.reconnectAttemptInFlight = false;
    this.clearCaptureAnchor();
    this.setPhase(phase);
    const socket = this.socket;
    this.socket = null;
    try {
      socket?.close(1000, phase === "aborted" ? "karaoke_aborted" : "karaoke_closed");
    } catch {
      // best-effort
    }
    // Tear down the mic so it never outlives the session, even if the UI forgets.
    // teardownCaptureOnce awaits any in-flight suspension (flush) before the stop.
    void this.teardownCaptureOnce();
  }
}

type KaraokeClientEnvelopeFields = { protocolVersion: unknown; sessionId: unknown; attemptId: unknown; sequence: unknown };

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
