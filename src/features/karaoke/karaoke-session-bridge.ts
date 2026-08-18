import {
  KARAOKE_TRANSPORT_PROTOCOL_VERSION,
  KaraokeSessionClient,
  type KaraokeCaptureAnchor,
  type KaraokeClientPhase,
  type KaraokeClientSocket,
  type KaraokeLineIdentity,
  type KaraokeServerEvent,
  type KaraokeSessionDescriptor,
} from "./runtime";

import type { ApiKaraokeSession } from "./runtime/api-contracts";

export class KaraokeApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly retryableExplicit: boolean;

  constructor(code: string, message: string, status: number, retryable?: boolean) {
    super(message);
    this.name = "KaraokeApiError";
    this.code = code;
    this.status = status;
    this.retryable = retryable ?? false;
    this.retryableExplicit = retryable !== undefined;
  }
}

export type { ApiKaraokeSession };

/**
 * Phase 5.1 web glue: bridges {@link KaraokeSessionClient} (which owns the
 * protocol, sequencing, token refresh, and reconnect logic) to the real
 * network — an authenticated session-creation HTTP call and a browser
 * `WebSocket`. Both seams are injectable so the bridge is testable with fakes;
 * the runtime client itself is already fully tested.
 */

export class KaraokeSessionResponseError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "KaraokeSessionResponseError";
    this.code = code;
  }
}

/** A creation/transport failure surfaced to the caller with the server's code. */
export interface KaraokeBridgeError {
  /** Preserved server error code (e.g. `karaoke_scoring_disabled`) when available. */
  code: string;
  message: string;
  /** HTTP status when the failure was an API error, else null (network/local). */
  status: number | null;
  /** Whether the bridge will keep retrying (transient) vs. abort the session (terminal). */
  retryable: boolean;
}

// HTTP statuses that are NOT worth retrying — the session is aborted instead of
// reconnecting in a loop. Everything else (5xx, 408/409/429, network) is transient.
const TERMINAL_STATUSES = new Set([400, 401, 403, 404]);

/** Classifies a creation failure, preserving the server error code/status. */
export function classifyKaraokeCreateError(error: unknown): KaraokeBridgeError {
  if (error instanceof KaraokeSessionResponseError) {
    // Response-shape / protocol / identity failures — retrying the same creation
    // won't fix them, so they're terminal.
    return { code: error.code, message: error.message, retryable: false, status: null };
  }
  if (error instanceof KaraokeApiError) {
    if (error.retryableExplicit && !error.retryable) {
      return { code: error.code, message: error.message, retryable: false, status: error.status };
    }
    const retryable =
      error.retryable === true
      || error.status >= 500
      || error.status === 408
      || error.status === 409
      || error.status === 429
      || !TERMINAL_STATUSES.has(error.status);
    return { code: error.code, message: error.message, retryable, status: error.status };
  }
  // Network / unknown failures are transient — let the runtime client reconnect.
  return {
    code: "karaoke_create_failed",
    message: error instanceof Error ? error.message : String(error),
    retryable: true,
    status: null,
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new KaraokeSessionResponseError("invalid_session_response", `karaoke session response: ${field} must be a non-empty string`);
  }
  return value;
}

function requirePositiveSafeInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new KaraokeSessionResponseError("invalid_session_response", `karaoke session response: ${field} must be a positive safe integer`);
  }
  return value;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

/** Validates the websocket URL parses and is `wss:` (allowing `ws:` only on loopback for local dev). */
function requireWebSocketUrl(value: unknown): string {
  const raw = requireString(value, "websocket_url");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new KaraokeSessionResponseError("invalid_websocket_url", "karaoke session response: websocket_url is not a valid URL");
  }
  if (url.protocol === "wss:") return raw;
  if (url.protocol === "ws:" && isLoopbackHost(url.hostname)) return raw;
  throw new KaraokeSessionResponseError("invalid_websocket_url", `karaoke session response: websocket_url must be wss: (got ${url.protocol})`);
}

export interface MapKaraokeSessionResponseContext {
  /** Current time (ms) used to reject an already-expired token. */
  nowMs?: number;
  /** The previously-issued descriptor; identity (id/attempt/protocol) must not drift on refresh. */
  previous?: KaraokeSessionDescriptor | null;
}

/**
 * Maps the snake_case HTTP body to the descriptor the transport needs, fully
 * validating it: object tag, positive safe-integer expirations with
 * `token_expires_at <= session_expires_at`, an unexpired token, a `wss:` URL,
 * and stable session identity across refreshes.
 */
export function mapKaraokeSessionResponse(
  raw: ApiKaraokeSession,
  context: MapKaraokeSessionResponseContext = {},
): KaraokeSessionDescriptor {
  if (raw.protocol_version !== KARAOKE_TRANSPORT_PROTOCOL_VERSION) {
    throw new KaraokeSessionResponseError(
      "protocol_version_mismatch",
      `karaoke protocol mismatch: client ${KARAOKE_TRANSPORT_PROTOCOL_VERSION}, server ${String(raw.protocol_version)}`,
    );
  }
  if (raw.object !== "karaoke_session") {
    throw new KaraokeSessionResponseError("invalid_session_response", `karaoke session response: unexpected object "${String(raw.object)}"`);
  }
  const id = requireString(raw.id, "id");
  const attempt = requireString(raw.attempt, "attempt");
  const tokenExpiresAt = requirePositiveSafeInt(raw.token_expires_at, "token_expires_at");
  const sessionExpiresAt = requirePositiveSafeInt(raw.session_expires_at, "session_expires_at");
  if (tokenExpiresAt > sessionExpiresAt) {
    throw new KaraokeSessionResponseError("invalid_session_response", "karaoke session response: token_expires_at is after session_expires_at");
  }
  if (context.nowMs !== undefined && tokenExpiresAt * 1000 <= context.nowMs) {
    throw new KaraokeSessionResponseError("token_already_expired", "karaoke session response: token is already expired");
  }
  const websocketUrl = requireWebSocketUrl(raw.websocket_url);

  const previous = context.previous;
  if (previous && (previous.id !== id || previous.attempt !== attempt || previous.protocolVersion !== KARAOKE_TRANSPORT_PROTOCOL_VERSION)) {
    throw new KaraokeSessionResponseError(
      "session_identity_changed",
      "karaoke session refresh returned a different session/attempt — refusing to reuse the stream",
    );
  }

  return {
    attempt,
    id,
    protocolVersion: KARAOKE_TRANSPORT_PROTOCOL_VERSION,
    sessionExpiresAt,
    tokenExpiresAt,
    websocketUrl,
  };
}

/** Constructs a browser `WebSocket` (overridable for tests / non-DOM hosts). */
export type KaraokeWebSocketConstructor = new (url: string) => {
  binaryType: string;
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (event: never) => void): void;
};

/**
 * Adapts a browser `WebSocket` to the minimal {@link KaraokeClientSocket} the
 * transport consumes. `binaryType` is forced to `"arraybuffer"`. Construction is
 * wrapped so a native exception (which can embed the full capability URL +
 * token) is replaced with a sanitized typed error that never leaks the URL.
 */
export function createBrowserKaraokeSocket(
  url: string,
  WebSocketCtor?: KaraokeWebSocketConstructor,
): KaraokeClientSocket {
  const Ctor = WebSocketCtor ?? (globalThis as { WebSocket?: KaraokeWebSocketConstructor }).WebSocket;
  if (!Ctor) {
    throw new KaraokeSessionResponseError("websocket_unavailable", "WebSocket is not available in this environment");
  }
  let ws: InstanceType<KaraokeWebSocketConstructor>;
  try {
    ws = new Ctor(url);
  } catch {
    // Deliberately drop the original error: it can contain the token-bearing URL.
    throw new KaraokeSessionResponseError("websocket_open_failed", "Failed to open the karaoke WebSocket");
  }
  ws.binaryType = "arraybuffer";
  return {
    addEventListener: (type: string, listener: (event: never) => void) =>
      ws.addEventListener(type, listener),
    close: (code?: number, reason?: string) => ws.close(code, reason),
    send: (data: string | ArrayBuffer) => ws.send(data),
  };
}

export interface CreateKaraokeSessionClientOptions {
  /**
   * Performs the authenticated `POST .../karaoke/sessions` call. The same
   * idempotencyKey is replayed on reconnect → refreshed token, same attempt.
   * `signal` is aborted on bridge teardown so an in-flight creation is cancelled.
   */
  createKaraokeSession: (input: {
    communityId: string;
    postId: string;
    idempotencyKey: string;
    signal: AbortSignal;
  }) => Promise<ApiKaraokeSession>;
  communityId: string;
  /** Public post id (the server route decodes it). */
  postId: string;
  onServerEvent: (event: KaraokeServerEvent) => void;
  onPhaseChange?: (phase: KaraokeClientPhase) => void;
  onError?: (error: KaraokeBridgeError) => void;
  /** WebSocket factory; defaults to a real browser socket. */
  connect?: (url: string) => KaraokeClientSocket;
  generateIdempotencyKey?: () => string;
  now?: () => number;
  tokenRefreshLeadMs?: number;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
  maxReconnectDelayMs?: number;
  socketConnectTimeoutMs?: number;
  /** Timer seams (injectable for tests); default to setTimeout/clearTimeout. */
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Reconnect capture hooks (SPEC §6); the web audio layer wires these in 5.2. */
  suspendCapture?: () => Promise<void>;
  resumeCapture?: (descriptor: KaraokeSessionDescriptor) => Promise<void>;
  /** Full capture teardown on close/abort/capture_failed (idempotent); 5.2 wires it. */
  teardownCapture?: () => void | Promise<void>;
}

/**
 * A network-wired karaoke session. `start()` takes NO postId — the bridge
 * supplies the captured one to both session creation and the start frame, so a
 * caller can't create a session for one post and start scoring another.
 */
export interface KaraokeSessionBridgeHandle {
  start(input?: { startedAtAudioMs?: number }): Promise<void>;
  /** Sets the capture→song anchor (SPEC §4.1). */
  setCaptureAnchor(anchor: KaraokeCaptureAnchor): void;
  clearCaptureAnchor(): void;
  /** Feeds a mic PCM16 buffer captured at `capturedAtMs` (mapped via the anchor). */
  pushAudio(pcm16: ArrayBuffer, capturedAtMs: number): void;
  playbackSync(audioTimeMs: number, playing: boolean): void;
  pause(audioTimeMs: number): void;
  resume(audioTimeMs: number): void;
  seek(audioTimeMs: number): void;
  lineBoundary(line: KaraokeLineIdentity, audioTimeMs: number): void;
  finish(audioTimeMs: number): void;
  abort(code: string): void;
  close(): void;
  getPhase(): KaraokeClientPhase;
}

/**
 * Wires a {@link KaraokeSessionClient} to the real network and returns a handle
 * whose `start()` carries no postId (see {@link KaraokeSessionBridgeHandle}).
 * Creation failures are classified to preserve the server's error code; terminal
 * (4xx) failures abort the session instead of reconnecting forever.
 */
export function createKaraokeSessionClient(options: CreateKaraokeSessionClientOptions): KaraokeSessionBridgeHandle {
  const now = options.now ?? (() => Date.now());
  const abortController = new AbortController();
  let previous: KaraokeSessionDescriptor | null = null;
  let client: KaraokeSessionClient;

  client = new KaraokeSessionClient({
    connect: options.connect ?? ((url) => createBrowserKaraokeSocket(url)),
    createSession: async ({ idempotencyKey }) => {
      try {
        const raw = await options.createKaraokeSession({
          communityId: options.communityId,
          idempotencyKey,
          postId: options.postId,
          signal: abortController.signal,
        });
        const descriptor = mapKaraokeSessionResponse(raw, { nowMs: now(), previous });
        previous = descriptor;
        return descriptor;
      } catch (error) {
        // Intentional teardown (close/abort) cancels the request — not an error.
        if (abortController.signal.aborted) throw error;
        const classified = classifyKaraokeCreateError(error);
        options.onError?.(classified);
        if (!classified.retryable) {
          // Terminal: stop the runtime client's reconnect loop deterministically.
          queueMicrotask(() => client.abort(classified.code));
        }
        throw error;
      }
    },
    generateIdempotencyKey: options.generateIdempotencyKey,
    now: options.now,
    // The runtime client emits a generic `karaoke_create_failed` after our
    // createSession throws — suppress it (we already emitted a precise error).
    // Other runtime errors (socket) are surfaced as transient.
    onError: (error) => {
      if (error.code === "karaoke_create_failed") return;
      const terminalRuntimeError =
        error.code === "karaoke_reconnect_exhausted"
        || error.code === "karaoke_stt_unconfigured";
      options.onError?.({
        code: error.code,
        message: error.message,
        retryable: !terminalRuntimeError,
        status: null,
      });
    },
    clearTimer: options.clearTimer,
    onPhaseChange: options.onPhaseChange,
    onServerEvent: options.onServerEvent,
    reconnectDelayMs: options.reconnectDelayMs,
    maxReconnectAttempts: options.maxReconnectAttempts,
    maxReconnectDelayMs: options.maxReconnectDelayMs,
    resumeCapture: options.resumeCapture,
    setTimer: options.setTimer,
    socketConnectTimeoutMs: options.socketConnectTimeoutMs,
    suspendCapture: options.suspendCapture,
    teardownCapture: options.teardownCapture,
    tokenRefreshLeadMs: options.tokenRefreshLeadMs,
  });

  return {
    abort: (code) => {
      abortController.abort();
      client.abort(code);
    },
    close: () => {
      abortController.abort();
      client.close();
    },
    clearCaptureAnchor: () => client.clearCaptureAnchor(),
    finish: (audioTimeMs) => client.finish(audioTimeMs),
    getPhase: () => client.getPhase(),
    lineBoundary: (line, audioTimeMs) => client.lineBoundary(line, audioTimeMs),
    pause: (audioTimeMs) => client.pause(audioTimeMs),
    playbackSync: (audioTimeMs, playing) => client.playbackSync(audioTimeMs, playing),
    pushAudio: (pcm16, capturedAtMs) => client.pushAudio(pcm16, capturedAtMs),
    resume: (audioTimeMs) => client.resume(audioTimeMs),
    seek: (audioTimeMs) => client.seek(audioTimeMs),
    setCaptureAnchor: (anchor) => client.setCaptureAnchor(anchor),
    start: (input) => client.start({ postId: options.postId, startedAtAudioMs: input?.startedAtAudioMs }),
  };
}
