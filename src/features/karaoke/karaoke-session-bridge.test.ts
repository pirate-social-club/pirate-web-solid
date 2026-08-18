import { describe, expect, test } from "bun:test";

import {
  decodeKaraokeBinaryFrame,
  KARAOKE_TRANSPORT_PROTOCOL_VERSION,
  type KaraokeClientSocket,
  type KaraokeServerEvent,
} from "./runtime";

import { KaraokeApiError as ApiError } from "./karaoke-session-bridge";
import type { ApiKaraokeSession as KaraokeSessionCreateApiResponse } from "./runtime/api-contracts";

import {
  classifyKaraokeCreateError,
  createBrowserKaraokeSocket,
  createKaraokeSessionClient,
  KaraokeSessionResponseError,
  mapKaraokeSessionResponse,
  type CreateKaraokeSessionClientOptions,
} from "./karaoke-session-bridge";

const PV = KARAOKE_TRANSPORT_PROTOCOL_VERSION;
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const BASE_NOW = 1_000_000_000; // ms

/** Runs `fn`, returns the thrown value, or fails if it does not throw. */
function caught(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected function to throw");
}

function responseErrorCode(fn: () => unknown): string {
  const error = caught(fn);
  expect(error instanceof KaraokeSessionResponseError).toBe(true);
  return (error as KaraokeSessionResponseError).code;
}

function apiResponse(
  overrides: Omit<Partial<KaraokeSessionCreateApiResponse>, "protocol_version"> & { protocol_version?: number } = {},
): KaraokeSessionCreateApiResponse {
  const response = {
    attempt: "attempt-1",
    id: "session-1",
    object: "karaoke_session",
    protocol_version: PV,
    scoring_policy: { kind: "disabled" },
    session_expires_at: Math.floor(BASE_NOW / 1000) + 3600,
    token_expires_at: Math.floor(BASE_NOW / 1000) + 60,
    websocket_url: "wss://gw.test/karaoke/sessions/session-1/websocket?token=secret-tok-1",
    ...overrides,
  };
  // SAFETY: these tests intentionally inject invalid protocol values to verify the response guard.
  return response as KaraokeSessionCreateApiResponse;
}

type Listener = (event?: unknown) => void;
class FakeSocket {
  readonly sent: (string | ArrayBuffer)[] = [];
  closed: { code?: number; reason?: string } | null = null;
  binaryType = "blob";
  private listeners: Record<string, Listener[]> = { close: [], error: [], message: [], open: [] };
  send(data: string | ArrayBuffer): void {
    this.sent.push(data);
  }
  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
    for (const l of this.listeners.close ?? []) l({ code, reason });
  }
  addEventListener(type: string, listener: Listener): void {
    (this.listeners[type] ??= []).push(listener);
  }
  open(): void {
    for (const l of this.listeners.open ?? []) l();
  }
  deliver(event: object): void {
    for (const l of this.listeners.message ?? []) l({ data: JSON.stringify(event) });
  }
  jsonSent(): Record<string, unknown>[] {
    return this.sent.filter((s): s is string => typeof s === "string").map((s) => JSON.parse(s));
  }
  binarySent(): ArrayBuffer[] {
    return this.sent.filter((s): s is ArrayBuffer => typeof s !== "string");
  }
}

class FakeTimers {
  now = BASE_NOW;
  private timers: { id: number; cb: () => void }[] = [];
  private id = 0;
  setTimer = (cb: () => void): unknown => {
    this.id += 1;
    this.timers.push({ cb, id: this.id });
    return this.id;
  };
  clearTimer = (handle: unknown): void => {
    this.timers = this.timers.filter((t) => t.id !== handle);
  };
  async flush(): Promise<void> {
    for (let pass = 0; pass < 10; pass += 1) {
      const pending = this.timers;
      this.timers = [];
      for (const t of pending) t.cb();
      await tick();
      if (this.timers.length === 0) return;
    }
  }
}

interface Harness {
  handle: ReturnType<typeof createKaraokeSessionClient>;
  sockets: FakeSocket[];
  createCalls: { communityId: string; postId: string; idempotencyKey: string; signal: AbortSignal }[];
  errors: { code: string; message: string; status: number | null; retryable: boolean }[];
  timers: FakeTimers;
  connectedUrls: string[];
}

function harness(opts: {
  responses?: (call: number) => KaraokeSessionCreateApiResponse | Promise<KaraokeSessionCreateApiResponse>;
  override?: Partial<CreateKaraokeSessionClientOptions>;
} = {}): Harness {
  const timers = new FakeTimers();
  const sockets: FakeSocket[] = [];
  const connectedUrls: string[] = [];
  const createCalls: Harness["createCalls"] = [];
  const errors: Harness["errors"] = [];

  const responses = opts.responses
    ?? ((): KaraokeSessionCreateApiResponse => apiResponse({
      session_expires_at: Math.floor(timers.now / 1000) + 3600,
      token_expires_at: Math.floor(timers.now / 1000) + 60,
    }));

  const handle = createKaraokeSessionClient({
    clearTimer: timers.clearTimer,
    communityId: "community-1",
    connect: (url) => {
      connectedUrls.push(url);
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as KaraokeClientSocket;
    },
    createKaraokeSession: async (input) => {
      createCalls.push(input);
      return responses(createCalls.length);
    },
    generateIdempotencyKey: () => "stable-key",
    now: () => timers.now,
    onError: (error) => errors.push(error),
    onServerEvent: () => {},
    postId: "post-1",
    setTimer: timers.setTimer,
    socketConnectTimeoutMs: Number.POSITIVE_INFINITY,
    ...opts.override,
  });

  return { connectedUrls, createCalls, errors, handle, sockets, timers };
}

describe("mapKaraokeSessionResponse", () => {
  test("maps the snake_case body to the transport descriptor", () => {
    expect(mapKaraokeSessionResponse(apiResponse())).toEqual({
      attempt: "attempt-1",
      id: "session-1",
      protocolVersion: PV,
      sessionExpiresAt: Math.floor(BASE_NOW / 1000) + 3600,
      tokenExpiresAt: Math.floor(BASE_NOW / 1000) + 60,
      websocketUrl: "wss://gw.test/karaoke/sessions/session-1/websocket?token=secret-tok-1",
    });
  });

  test("rejects a protocol-version mismatch", () => {
    expect(responseErrorCode(() => mapKaraokeSessionResponse(apiResponse({ protocol_version: PV + 1 })))).toBe("protocol_version_mismatch");
  });

  test("rejects a wrong object tag and malformed strings", () => {
    expect(responseErrorCode(() => mapKaraokeSessionResponse(apiResponse({ object: "nope" as never })))).toBe("invalid_session_response");
    expect(responseErrorCode(() => mapKaraokeSessionResponse(apiResponse({ id: "" })))).toBe("invalid_session_response");
  });

  test("rejects non-positive / non-safe-integer expirations", () => {
    expect(responseErrorCode(() => mapKaraokeSessionResponse(apiResponse({ token_expires_at: 0 })))).toBe("invalid_session_response");
    expect(responseErrorCode(() => mapKaraokeSessionResponse(apiResponse({ token_expires_at: -1 })))).toBe("invalid_session_response");
    expect(responseErrorCode(() => mapKaraokeSessionResponse(apiResponse({ session_expires_at: Number.NaN })))).toBe("invalid_session_response");
    expect(responseErrorCode(() => mapKaraokeSessionResponse(apiResponse({ session_expires_at: 1.5 })))).toBe("invalid_session_response");
  });

  test("rejects token_expires_at after session_expires_at", () => {
    expect(responseErrorCode(() => mapKaraokeSessionResponse(apiResponse({ session_expires_at: 100, token_expires_at: 200 })))).toBe("invalid_session_response");
  });

  test("rejects an already-expired token against nowMs", () => {
    const resp = apiResponse({ session_expires_at: 5000, token_expires_at: 1000 });
    expect(responseErrorCode(() => mapKaraokeSessionResponse(resp, { nowMs: 2_000_000 }))).toBe("token_already_expired");
  });

  test("rejects a non-wss URL but allows ws:// on loopback", () => {
    expect(responseErrorCode(() => mapKaraokeSessionResponse(apiResponse({ websocket_url: "ws://gw.test/ws" })))).toBe("invalid_websocket_url");
    expect(responseErrorCode(() => mapKaraokeSessionResponse(apiResponse({ websocket_url: "https://gw.test/ws" })))).toBe("invalid_websocket_url");
    expect(mapKaraokeSessionResponse(apiResponse({ websocket_url: "ws://127.0.0.1:8787/ws" })).websocketUrl).toBe("ws://127.0.0.1:8787/ws");
  });

  test("rejects identity drift on refresh and accepts a stable identity", () => {
    const previous = mapKaraokeSessionResponse(apiResponse());
    expect(responseErrorCode(() => mapKaraokeSessionResponse(apiResponse({ attempt: "attempt-2" }), { previous }))).toBe("session_identity_changed");
    expect(mapKaraokeSessionResponse(apiResponse(), { previous }).attempt).toBe("attempt-1");
  });
});

describe("classifyKaraokeCreateError", () => {
  test("preserves server codes and marks 4xx terminal, 5xx/429/409 retryable", () => {
    expect(classifyKaraokeCreateError(new ApiError("karaoke_session_actor_not_allowed", "no", 403))).toEqual({ code: "karaoke_session_actor_not_allowed", message: "no", retryable: false, status: 403 });
    expect(classifyKaraokeCreateError(new ApiError("karaoke_scoring_disabled", "off", 400)).retryable).toBe(false);
    expect(classifyKaraokeCreateError(new ApiError("karaoke_runtime_unavailable", "down", 503)).retryable).toBe(true);
    expect(classifyKaraokeCreateError(new ApiError("karaoke_stt_unconfigured", "missing", 503, false)).retryable).toBe(false);
    expect(classifyKaraokeCreateError(new ApiError("karaoke_session_create_in_progress", "wait", 409)).retryable).toBe(true);
    expect(classifyKaraokeCreateError(new KaraokeSessionResponseError("session_identity_changed", "x"))).toEqual({ code: "session_identity_changed", message: "x", retryable: false, status: null });
    expect(classifyKaraokeCreateError(new TypeError("network down"))).toEqual({ code: "karaoke_create_failed", message: "network down", retryable: true, status: null });
  });
});

describe("createBrowserKaraokeSocket", () => {
  test("forces arraybuffer and forwards send/close/listeners", () => {
    const fake = new FakeSocket();
    const Ctor = function (this: unknown) {
      return fake;
    } as unknown as Parameters<typeof createBrowserKaraokeSocket>[1];
    const socket = createBrowserKaraokeSocket("wss://gw.test/ws", Ctor);
    expect(fake.binaryType).toBe("arraybuffer");
    let opened = false;
    socket.addEventListener("open", () => {
      opened = true;
    });
    fake.open();
    expect(opened).toBe(true);
    socket.send("hello");
    expect(fake.sent).toEqual(["hello"]);
  });

  test("throws when no WebSocket is available", () => {
    const holder = globalThis as { WebSocket?: unknown };
    const original = holder.WebSocket;
    delete holder.WebSocket;
    try {
      expect(responseErrorCode(() => createBrowserKaraokeSocket("wss://gw.test/ws", undefined))).toBe("websocket_unavailable");
    } finally {
      holder.WebSocket = original;
    }
  });

  test("sanitizes a constructor exception so it never leaks the token URL", () => {
    const url = "wss://gw.test/ws?token=SUPER-SECRET-TOKEN";
    const Ctor = function () {
      throw new Error(`failed to connect to ${url}`);
    } as unknown as Parameters<typeof createBrowserKaraokeSocket>[1];
    const error = caught(() => createBrowserKaraokeSocket(url, Ctor));
    expect(error instanceof KaraokeSessionResponseError).toBe(true);
    expect((error as KaraokeSessionResponseError).code).toBe("websocket_open_failed");
    expect((error as Error).message.includes("SUPER-SECRET-TOKEN")).toBe(false);
    expect((error as Error).message.includes("token=")).toBe(false);
  });
});

describe("createKaraokeSessionClient", () => {
  test("start() carries no postId — the captured post id is used for creation and the start frame", async () => {
    const h = harness();
    await h.handle.start({ startedAtAudioMs: 0 });
    expect(h.createCalls[0]?.communityId).toBe("community-1");
    expect(h.createCalls[0]?.postId).toBe("post-1");
    expect(h.createCalls[0]?.idempotencyKey).toBe("stable-key");
    expect(h.connectedUrls[0]).toBe("wss://gw.test/karaoke/sessions/session-1/websocket?token=secret-tok-1");
    h.sockets[0]!.open();
    await tick();
    expect(h.handle.getPhase()).toBe("live");
    const start = h.sockets[0]!.jsonSent()[0];
    expect(start?.type).toBe("start");
    expect(start?.postId).toBe("post-1");
    expect(start?.sessionId).toBe("session-1");
  });

  test("propagates typed server events", async () => {
    const events: KaraokeServerEvent[] = [];
    const h = harness({ override: { onServerEvent: (e) => events.push(e) } });
    await h.handle.start();
    h.sockets[0]!.open();
    await tick();
    h.sockets[0]!.deliver({ attemptId: "attempt-1", eventId: "e1", protocolVersion: PV, result: { lineId: "line-1" }, sequence: 1, sessionId: "session-1", type: "line_score" });
    expect(events.map((e) => e.type)).toEqual(["line_score"]);
  });

  test("reconnect reuses the idempotency key and keeps the same attempt", async () => {
    const h = harness();
    await h.handle.start();
    h.sockets[0]!.open();
    await tick();
    expect(h.handle.getPhase()).toBe("live");

    h.sockets[0]!.close(1006); // genuine drop → reactive reconnect
    await tick();
    await h.timers.flush(); // fire the reconnect-delay timer → re-create with the same key
    h.sockets[h.sockets.length - 1]!.open();
    await tick();

    expect(h.createCalls.length >= 2).toBe(true);
    expect(h.createCalls.every((c) => c.idempotencyKey === "stable-key")).toBe(true);
    expect(h.handle.getPhase()).toBe("live");
  });

  test("surfaces configuration close code 4002 as terminal without reconnecting", async () => {
    const h = harness();
    await h.handle.start();
    h.sockets[0]!.open();
    await tick();

    h.sockets[0]!.close(4002, "Karaoke scoring unavailable");
    await tick();

    expect(h.createCalls).toHaveLength(1);
    expect(h.handle.getPhase()).toBe("aborted");
    expect(h.errors.at(-1)).toEqual({
      code: "karaoke_stt_unconfigured",
      message: "Karaoke scoring is not configured for this community",
      retryable: false,
      status: null,
    });
  });

  test("a terminal HTTP error preserves the server code and aborts (no reconnect loop)", async () => {
    const h = harness({
      responses: () => {
        throw new ApiError("karaoke_session_actor_not_allowed", "actor not allowed", 403);
      },
    });
    await h.handle.start();
    await tick();
    expect(h.errors).toEqual([{ code: "karaoke_session_actor_not_allowed", message: "actor not allowed", retryable: false, status: 403 }]);
    expect(h.handle.getPhase()).toBe("aborted");
  });

  test("reports reconnect exhaustion as terminal when the retry budget is exhausted", async () => {
    const h = harness({
      override: { maxReconnectAttempts: 0 },
      responses: () => { throw new TypeError("network down"); },
    });

    await h.handle.start();
    await h.timers.flush();
    await tick();
    await tick();
    await tick();

    expect(h.createCalls).toHaveLength(1);
    expect(h.errors.at(-1)).toEqual({
      code: "karaoke_reconnect_exhausted",
      message: "Karaoke connection failed after 0 reconnect attempts",
      retryable: false,
      status: null,
    });
    expect(h.handle.getPhase()).toBe("aborted");
  });

  test("identity drift on reconnect is terminal", async () => {
    const h = harness({
      responses: (call) => apiResponse({
        attempt: call === 1 ? "attempt-1" : "attempt-2", // drift on the reconnect call
        session_expires_at: Math.floor(BASE_NOW / 1000) + 3600,
        token_expires_at: Math.floor(BASE_NOW / 1000) + 60,
      }),
    });
    await h.handle.start();
    h.sockets[0]!.open();
    await tick();
    h.sockets[0]!.close(1006); // drop → reconnect re-creates → identity drift
    await tick();
    await h.timers.flush();
    await tick();
    expect(h.errors.some((e) => e.code === "session_identity_changed")).toBe(true);
    expect(h.handle.getPhase()).toBe("aborted");
  });

  test("anchor + pushAudio map through the runtime client to a binary frame", async () => {
    const h = harness();
    await h.handle.start();
    h.sockets[0]!.open();
    await tick();
    h.handle.setCaptureAnchor({ captureMs: 1000, playbackRate: 1, songMs: 5000 });
    h.handle.pushAudio(new Uint8Array(320).buffer, 1000); // 10ms buffer at the anchor
    const frames = h.sockets[0]!.binarySent();
    expect(frames.length).toBe(1);
    const decoded = decodeKaraokeBinaryFrame(frames[0]!, { attemptId: "attempt-1", sessionId: "session-1" });
    expect(decoded.frame?.songEndMs).toBe(5000);
    expect(decoded.frame?.songStartMs).toBe(4990);
    // dropped once the anchor is cleared
    h.handle.clearCaptureAnchor();
    h.handle.pushAudio(new Uint8Array(320).buffer, 2000);
    expect(h.sockets[0]!.binarySent().length).toBe(1);
  });

  test("forwards reconnect capture hooks to the runtime client", async () => {
    const order: string[] = [];
    const h = harness({
      override: {
        reconnectDelayMs: 1,
        resumeCapture: async () => {
          order.push("resume");
        },
        suspendCapture: async () => {
          order.push("suspend");
        },
      },
    });
    await h.handle.start();
    h.sockets[0]!.open();
    await tick();
    h.sockets[0]!.close(1006); // genuine drop → suspend then reconnect
    await tick();
    await h.timers.flush();
    h.sockets[h.sockets.length - 1]!.open();
    await tick();
    expect(order).toEqual(["suspend", "resume"]);
  });

  test("close() aborts the creation signal and emits no error", async () => {
    const h = harness();
    await h.handle.start();
    h.sockets[0]!.open();
    await tick();
    expect(h.createCalls[0]!.signal.aborted).toBe(false);
    h.handle.close();
    expect(h.createCalls[0]!.signal.aborted).toBe(true);
    expect(h.handle.getPhase()).toBe("closed");
    expect(h.errors).toEqual([]);
  });
});
