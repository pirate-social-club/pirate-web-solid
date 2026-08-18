import { describe, expect, test } from "bun:test"
import { decodeKaraokeBinaryFrame } from "../binary-codec"
import {
  KaraokeSessionClient,
  type KaraokeClientSocket,
  type KaraokeSessionDescriptor,
} from "../karaoke-session-client"
import { KARAOKE_TRANSPORT_PROTOCOL_VERSION, type KaraokeServerEvent } from "../transport"

const PV = KARAOKE_TRANSPORT_PROTOCOL_VERSION
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

type Listener = (event?: unknown) => void
class FakeSocket {
  readonly sent: (string | ArrayBuffer)[] = []
  closed: { code?: number; reason?: string } | null = null
  private listeners: Record<string, Listener[]> = { close: [], error: [], message: [], open: [] }

  send(data: string | ArrayBuffer): void {
    this.sent.push(data)
  }
  close(code?: number, reason?: string): void {
    this.closed = { code, reason }
  }
  addEventListener(type: string, listener: Listener): void {
    ;(this.listeners[type] ??= []).push(listener)
  }
  private fire(type: string, event?: unknown): void {
    for (const listener of this.listeners[type] ?? []) listener(event)
  }
  open(): void {
    this.fire("open")
  }
  deliver(event: object): void {
    this.fire("message", { data: JSON.stringify(event) })
  }
  remoteClose(code = 1006, reason = ""): void {
    this.fire("close", { code, reason })
  }
  jsonSent(): Record<string, unknown>[] {
    return this.sent.filter((s): s is string => typeof s === "string").map((s) => JSON.parse(s))
  }
  binarySent(): ArrayBuffer[] {
    return this.sent.filter((s): s is ArrayBuffer => typeof s !== "string")
  }
}

class FakeTimers {
  now = 1_000_000
  readonly scheduledMs: number[] = []
  private timers: { id: number; cb: () => void }[] = []
  private id = 0
  setTimer = (cb: () => void, ms: number): unknown => {
    this.id += 1
    this.scheduledMs.push(ms)
    this.timers.push({ cb, id: this.id })
    return this.id
  }
  clearTimer = (handle: unknown): void => {
    this.timers = this.timers.filter((t) => t.id !== handle)
  }
  // Drain chained timers (e.g. token-refresh → reconnect), awaiting async work
  // between passes, until nothing remains.
  async flush(): Promise<void> {
    for (let pass = 0; pass < 10; pass += 1) {
      const pending = this.timers
      this.timers = []
      for (const t of pending) t.cb()
      await tick()
      if (this.timers.length === 0) return
    }
  }
}

interface Harness {
  client: KaraokeSessionClient
  sockets: FakeSocket[]
  idempotencyKeys: string[]
  serverEvents: KaraokeServerEvent[]
  phases: string[]
  errors: { code: string; message: string }[]
  timers: FakeTimers
  descriptorFor: (call: number) => KaraokeSessionDescriptor
}

function harness(overrides: Partial<{
  tokenTtlMs: number
  sessionTtlMs: number
  socketConnectTimeoutMs: number
  suspendCapture: () => Promise<void>
  resumeCapture: (descriptor: KaraokeSessionDescriptor) => Promise<void>
  teardownCapture: () => void | Promise<void>
  captureTeardownTimeoutMs: number
  createSession: (input: { idempotencyKey: string }) => Promise<KaraokeSessionDescriptor>
  maxReconnectAttempts: number
  maxReconnectDelayMs: number
}> = {}): Harness {
  const timers = new FakeTimers()
  const sockets: FakeSocket[] = []
  const idempotencyKeys: string[] = []
  const serverEvents: KaraokeServerEvent[] = []
  const phases: string[] = []
  const errors: { code: string; message: string }[] = []
  const tokenTtlMs = overrides.tokenTtlMs ?? 60_000
  const sessionTtlMs = overrides.sessionTtlMs ?? 3_600_000

  const descriptorFor = (call: number): KaraokeSessionDescriptor => ({
    attempt: "attempt-1", // stable across reconnects
    id: "session-1",
    protocolVersion: PV,
    sessionExpiresAt: Math.floor((timers.now + sessionTtlMs) / 1000),
    tokenExpiresAt: Math.floor((timers.now + tokenTtlMs) / 1000),
    websocketUrl: `wss://gw.test/session-1/websocket?token=token-${call}`,
  })

  const client = new KaraokeSessionClient({
    clearTimer: timers.clearTimer,
    connect: () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket as unknown as KaraokeClientSocket
    },
    createSession: async ({ idempotencyKey }) => {
      idempotencyKeys.push(idempotencyKey)
      if (overrides.createSession) return await overrides.createSession({ idempotencyKey })
      return descriptorFor(idempotencyKeys.length)
    },
    generateIdempotencyKey: () => "stable-key",
    now: () => timers.now,
    onError: (error) => errors.push(error),
    onPhaseChange: (phase) => phases.push(phase),
    onServerEvent: (event) => serverEvents.push(event),
    captureTeardownTimeoutMs: overrides.captureTeardownTimeoutMs,
    maxReconnectAttempts: overrides.maxReconnectAttempts,
    maxReconnectDelayMs: overrides.maxReconnectDelayMs,
    resumeCapture: overrides.resumeCapture,
    setTimer: timers.setTimer,
    socketConnectTimeoutMs: overrides.socketConnectTimeoutMs ?? Number.POSITIVE_INFINITY,
    suspendCapture: overrides.suspendCapture,
    teardownCapture: overrides.teardownCapture,
  })

  return { client, descriptorFor, errors, idempotencyKeys, phases, serverEvents, sockets, timers }
}

describe("KaraokeSessionClient transport", () => {
  test("creates a session and sends start on the first connection", async () => {
    const h = harness()
    await h.client.start({ postId: "post-1", startedAtAudioMs: 0 })
    expect(h.idempotencyKeys).toEqual(["stable-key"])
    expect(h.sockets).toHaveLength(1)

    h.sockets[0]!.open()
    expect(h.client.getPhase()).toBe("live")
    const events = h.sockets[0]!.jsonSent()
    expect(events[0]).toMatchObject({ attemptId: "attempt-1", postId: "post-1", sequence: 1, sessionId: "session-1", type: "start" })
  })

  test("aborts instead of hanging forever when the socket never opens", async () => {
    const h = harness({ socketConnectTimeoutMs: 250 })
    await h.client.start({ postId: "post-1", startedAtAudioMs: 0 })
    expect(h.client.getPhase()).toBe("connecting")

    await h.timers.flush()

    expect(h.client.getPhase()).toBe("aborted")
    expect(h.errors).toContainEqual({ code: "karaoke_socket_connect_timeout", message: "Karaoke WebSocket did not open" })
    expect(h.sockets[0]?.closed).toEqual({ code: 1000, reason: "karaoke_aborted" })
  })

  test("aborts with a socket error when the socket closes before opening", async () => {
    const h = harness()
    await h.client.start({ postId: "post-1", startedAtAudioMs: 0 })

    h.sockets[0]!.remoteClose(1006, "")

    expect(h.client.getPhase()).toBe("aborted")
    expect(h.errors).toContainEqual({
      code: "karaoke_socket_closed_before_open",
      message: "Karaoke WebSocket closed before opening (1006)",
    })
  })

  test("maps binary frame song-time bounds through the capture anchor (capture ≠ playback)", async () => {
    const h = harness()
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()

    // Anchor: capture clock 10000ms ↔ song 1500ms, rate 1.
    h.client.setCaptureAnchor({ captureMs: 10_000, playbackRate: 1, songMs: 1500 })
    h.client.pushAudio(new Uint8Array(320).buffer, 10_000) // 320 bytes = 10ms; captured at the anchor

    const frames = h.sockets[0]!.binarySent()
    expect(frames).toHaveLength(1)
    const decoded = decodeKaraokeBinaryFrame(frames[0]!, { attemptId: "attempt-1", sessionId: "session-1" })
    expect(decoded.frame?.songEndMs).toBe(1500) // anchor song at the captured time
    expect(decoded.frame?.songStartMs).toBe(1490) // minus the buffer's 10ms duration
    expect(decoded.frame?.sequence).toBe(2) // shares the sequence space with start (1)
  })

  test("anchor mapping is rate-aware", async () => {
    const h = harness()
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    // rate 2.0: 100ms of capture clock advances 200ms of song time.
    h.client.setCaptureAnchor({ captureMs: 1000, playbackRate: 2, songMs: 5000 })
    h.client.pushAudio(new Uint8Array(320).buffer, 1100) // 10ms buffer, +100ms capture

    const decoded = decodeKaraokeBinaryFrame(h.sockets[0]!.binarySent()[0]!, { attemptId: "attempt-1", sessionId: "session-1" })
    expect(decoded.frame?.songEndMs).toBe(5200) // 5000 + 100*2
    expect(decoded.frame?.songStartMs).toBe(5180) // minus 10ms*2 of song time
  })

  test("drops audio pushed while unanchored", async () => {
    const h = harness()
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.client.pushAudio(new Uint8Array(320).buffer, 1000) // no anchor set → dropped
    expect(h.sockets[0]!.binarySent()).toHaveLength(0)
    h.client.setCaptureAnchor({ captureMs: 1000, playbackRate: 1, songMs: 0 })
    h.client.clearCaptureAnchor()
    h.client.pushAudio(new Uint8Array(320).buffer, 1000) // cleared again → dropped
    expect(h.sockets[0]!.binarySent()).toHaveLength(0)
  })

  test("rejects invalid anchors", async () => {
    const h = harness()
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    expect(() => h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 0, songMs: 0 })).toThrow()
    expect(() => h.client.setCaptureAnchor({ captureMs: 0, playbackRate: -1, songMs: 0 })).toThrow()
    expect(() => h.client.setCaptureAnchor({ captureMs: Number.NaN, playbackRate: 1, songMs: 0 })).toThrow()
    expect(() => h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: -1 })).toThrow()
  })

  test("client events share the monotonic sequence and carry session identity", async () => {
    const h = harness()
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: 0 })
    h.client.pushAudio(new Uint8Array(320).buffer, 0) // seq 2
    h.client.playbackSync(2000, true) // seq 3
    h.client.lineBoundary({ lineId: "line-1", lineIndex: 0, scoredLineIndex: 0 }, 2200) // seq 4

    const json = h.sockets[0]!.jsonSent()
    expect(json.find((e) => e.type === "playback_sync")).toMatchObject({ sequence: 3 })
    expect(json.find((e) => e.type === "line_boundary")).toMatchObject({ lineId: "line-1", sequence: 4 })
  })

  test("dispatches typed server events and ignores malformed frames", async () => {
    const h = harness()
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.sockets[0]!.deliver({ attemptId: "attempt-1", eventId: "e1", protocolVersion: PV, result: { lineId: "line-1" }, sequence: 1, sessionId: "session-1", type: "line_score" })
    h.sockets[0]!.deliver({ junk: true })
    expect(h.serverEvents).toHaveLength(1)
    expect(h.serverEvents[0]?.type).toBe("line_score")
  })

  test("reconnect replays creation (same attempt, refreshed token) without re-sending start or PCM", async () => {
    const h = harness()
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: 0 })
    h.client.pushAudio(new Uint8Array(320).buffer, 0) // seq 2 on the first stream

    // Unexpected disconnect.
    h.sockets[0]!.remoteClose(1006)
    expect(h.client.getPhase()).toBe("reconnecting")
    await h.timers.flush() // fire the reconnect timer → re-create + reconnect

    expect(h.idempotencyKeys).toEqual(["stable-key", "stable-key"]) // same key → same attempt
    expect(h.sockets).toHaveLength(2)

    h.sockets[1]!.open()
    expect(h.client.getPhase()).toBe("live")
    // No start re-sent, and no PCM replayed on the new stream.
    const reconnectJson = h.sockets[1]!.jsonSent()
    expect(reconnectJson.some((e) => e.type === "start")).toBe(false)
    expect(h.sockets[1]!.binarySent()).toHaveLength(0)

    // The reconnect cleared the anchor: audio is dropped until a fresh anchor is set.
    h.client.pushAudio(new Uint8Array(320).buffer, 3000)
    expect(h.sockets[1]!.binarySent()).toHaveLength(0)

    // New audio resumes (fresh anchor) with a continuing sequence (no reset).
    h.client.setCaptureAnchor({ captureMs: 3000, playbackRate: 1, songMs: 3000 })
    h.client.pushAudio(new Uint8Array(320).buffer, 3000)
    const frame = decodeKaraokeBinaryFrame(h.sockets[1]!.binarySent()[0]!, { attemptId: "attempt-1", sessionId: "session-1" })
    expect(frame.frame?.sequence).toBe(3) // continues after seq 2 from the first stream
  })

  test("treats server expiry close code 4001 as terminal without reconnecting", async () => {
    const h = harness()
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()

    h.sockets[0]!.remoteClose(4001, "Karaoke session expired")
    await tick()

    expect(h.client.getPhase()).toBe("expired")
    expect(h.idempotencyKeys).toEqual(["stable-key"])
  })

  test("treats server configuration close code 4002 as terminal without reconnecting", async () => {
    const h = harness()
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()

    h.sockets[0]!.remoteClose(4002, "Karaoke scoring unavailable")
    await tick()

    expect(h.client.getPhase()).toBe("aborted")
    expect(h.idempotencyKeys).toEqual(["stable-key"])
    expect(h.errors).toContainEqual({
      code: "karaoke_stt_unconfigured",
      message: "Karaoke scoring is not configured for this community",
    })
  })

  test("keeps a reconnect guarded while session creation is in flight", async () => {
    let createCall = 0
    let rejectReconnect: ((error: Error) => void) | undefined
    const descriptor: KaraokeSessionDescriptor = {
      attempt: "attempt-1",
      id: "session-1",
      protocolVersion: PV,
      sessionExpiresAt: 4_600,
      tokenExpiresAt: 1_060,
      websocketUrl: "wss://gw.test/session-1/websocket?token=token",
    }
    const h = harness({
      createSession: async () => {
        createCall += 1
        if (createCall === 1) return descriptor
        return await new Promise<KaraokeSessionDescriptor>((_resolve, reject) => {
          rejectReconnect = reject
        })
      },
    })
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.sockets[0]!.remoteClose(1006)
    await h.timers.flush()

    expect(createCall).toBe(2)
    expect(h.timers.scheduledMs).toEqual([250])

    // Exercise the scheduling invariant directly while creation is pending:
    // the cleared timer handle is not enough to guard this window.
    ;(h.client as unknown as { scheduleReconnect(): void }).scheduleReconnect()
    expect(h.timers.scheduledMs).toEqual([250])

    rejectReconnect?.(new Error("transient create failure"))
    await tick()
    expect(h.timers.scheduledMs).toEqual([250, 500])
  })

  test("bounds failed creation reconnects with capped exponential backoff", async () => {
    const h = harness({
      createSession: async () => { throw new Error("runtime unavailable") },
      maxReconnectAttempts: 5,
      maxReconnectDelayMs: 2_000,
    })

    await h.client.start({ postId: "post-1" })
    await h.timers.flush()

    expect(h.idempotencyKeys).toHaveLength(6) // initial request + five retries
    expect(h.timers.scheduledMs.slice(0, 5)).toEqual([250, 500, 1_000, 2_000, 2_000])
    expect(h.errors.at(-1)).toEqual({
      code: "karaoke_reconnect_exhausted",
      message: "Karaoke connection failed after 5 reconnect attempts",
    })
    expect(h.client.getPhase()).toBe("aborted")
  })

  test("reconnect awaits suspendCapture then resumeCapture in order (SPEC §6)", async () => {
    const order: string[] = []
    const h = harness({
      resumeCapture: async (descriptor) => {
        order.push(`resume:${descriptor.id}`)
      },
      suspendCapture: async () => {
        order.push("suspend")
      },
    })
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: 0 })

    h.sockets[0]!.remoteClose(1006) // schedules suspend (runs on a microtask)
    await tick()
    expect(order).toEqual(["suspend"])
    await h.timers.flush()
    h.sockets[1]!.open()
    await tick() // let the async resume settle
    expect(order).toEqual(["suspend", "resume:session-1"])
  })

  test("drops pre-anchor and in-epoch regressing capture timestamps; a re-anchor resets the guard", async () => {
    const h = harness()
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.client.setCaptureAnchor({ captureMs: 1000, playbackRate: 1, songMs: 5000 })

    h.client.pushAudio(new Uint8Array(320).buffer, 900) // before anchor.captureMs → dropped
    expect(h.sockets[0]!.binarySent()).toHaveLength(0)

    h.client.pushAudio(new Uint8Array(320).buffer, 1500) // accepted
    expect(h.sockets[0]!.binarySent()).toHaveLength(1)
    h.client.pushAudio(new Uint8Array(320).buffer, 1400) // regression within epoch → dropped
    expect(h.sockets[0]!.binarySent()).toHaveLength(1)

    // A backward seek must re-anchor; that resets the monotonic guard.
    h.client.setCaptureAnchor({ captureMs: 1400, playbackRate: 1, songMs: 2000 })
    h.client.pushAudio(new Uint8Array(320).buffer, 1400) // accepted under the new epoch
    expect(h.sockets[0]!.binarySent()).toHaveLength(2)
  })

  test("a superseded reconnect does not reactivate capture", async () => {
    const suspendResolvers: (() => void)[] = []
    const resumed: string[] = []
    const h = harness({
      resumeCapture: async (descriptor) => {
        resumed.push(descriptor.id)
      },
      suspendCapture: () => new Promise<void>((resolve) => suspendResolvers.push(resolve)),
    })
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: 0 })

    h.sockets[0]!.remoteClose(1006) // suspend #1 starts (kept pending)
    await tick()
    await h.timers.flush() // reconnect timer → socket #1
    h.sockets[1]!.open() // resume awaits suspend #1 (still pending)

    // Supersede socket #1 before suspend #1 resolves.
    h.sockets[1]!.remoteClose(1006)
    await tick()
    suspendResolvers[0]!() // resolve suspend #1 → socket #1's resume continues
    await tick()
    await tick()

    expect(resumed).toEqual([]) // the superseded socket must NOT reactivate capture
  })

  test("a failed resumeCapture clears the anchor and reports an error", async () => {
    let activeClient: KaraokeSessionClient | null = null
    const h = harness({
      resumeCapture: async () => {
        // Simulate partial activation: set an anchor, then fail.
        activeClient!.setCaptureAnchor({ captureMs: 100, playbackRate: 1, songMs: 100 })
        throw new Error("mic busy")
      },
      suspendCapture: async () => {},
    })
    activeClient = h.client
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: 0 })

    h.sockets[0]!.remoteClose(1006)
    await h.timers.flush()
    h.sockets[1]!.open()
    await tick()
    await tick()

    expect(h.errors.some((e) => e.code === "karaoke_capture_resume_failed")).toBe(true)
    // Anchor was cleared on failure → audio is dropped (no stale-anchor streaming).
    h.client.pushAudio(new Uint8Array(320).buffer, 200)
    expect(h.sockets[1]!.binarySent()).toHaveLength(0)
  })

  test("close during the suspend await prevents later reactivation", async () => {
    const suspendResolvers: (() => void)[] = []
    const resumed: string[] = []
    const h = harness({
      resumeCapture: async (descriptor) => {
        resumed.push(descriptor.id)
      },
      suspendCapture: () => new Promise<void>((resolve) => suspendResolvers.push(resolve)),
    })
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: 0 })

    h.sockets[0]!.remoteClose(1006)
    await tick()
    await h.timers.flush()
    h.sockets[1]!.open() // resume awaits the pending suspend
    h.client.close() // terminal close during the await
    suspendResolvers[0]!()
    await tick()
    await tick()

    expect(resumed).toEqual([])
    expect(h.client.getPhase()).toBe("closed")
  })

  test("an expired-session disconnect still suspends capture (F1)", async () => {
    const order: string[] = []
    const h = harness({ sessionTtlMs: 5_000, suspendCapture: async () => { order.push("suspend") } })
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: 0 })

    h.timers.now += 6_000 // past sessionExpiresAt
    h.sockets[0]!.remoteClose(1006)
    await tick()
    expect(h.client.getPhase()).toBe("expired")
    expect(order).toEqual(["suspend"]) // mic engine suspended even though we won't reconnect
  })

  test("a suspend failure blocks resume and fails the capture transition (F2)", async () => {
    const resumed: string[] = []
    const h = harness({
      resumeCapture: async (d) => { resumed.push(d.id) },
      suspendCapture: async () => { throw new Error("flush failed") },
    })
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: 0 })

    h.sockets[0]!.remoteClose(1006)
    await h.timers.flush()
    h.sockets[1]!.open()
    await tick()
    await tick()

    expect(resumed).toEqual([]) // never resumed after a failed suspend
    expect(h.client.getPhase()).toBe("capture_failed")
    expect(h.errors.some((e) => e.code === "karaoke_capture_suspend_failed")).toBe(true)
    expect(h.sockets[1]!.closed).not.toBeNull() // socket torn down, not left live
  })

  test("a resume failure moves to capture_failed with the socket closed (F3)", async () => {
    const h = harness({
      resumeCapture: async () => { throw new Error("mic busy") },
      suspendCapture: async () => {},
    })
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: 0 })

    h.sockets[0]!.remoteClose(1006)
    await h.timers.flush()
    h.sockets[1]!.open()
    await tick()
    await tick()

    expect(h.client.getPhase()).toBe("capture_failed")
    expect(h.errors.some((e) => e.code === "karaoke_capture_resume_failed")).toBe(true)
    expect(h.sockets[1]!.closed).not.toBeNull()
    // No longer live → audio is dropped (anchor cleared, socket gone).
    h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: 0 })
    h.client.pushAudio(new Uint8Array(320).buffer, 0)
    expect(h.sockets[1]!.binarySent()).toHaveLength(0)
  })

  test("drops and reports song bounds that overflow the binary codec's uint32 (F4)", async () => {
    const h = harness()
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    // songMs beyond uint32 max (~4.29e9 ms) → songEnd would overflow the codec.
    h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: 5_000_000_000 })
    h.client.pushAudio(new Uint8Array(320).buffer, 0)
    expect(h.sockets[0]!.binarySent()).toHaveLength(0)
    expect(h.errors.some((e) => e.code === "karaoke_audio_bounds_invalid")).toBe(true)
  })

  test("a live-session close tears down the capture engine (F5)", async () => {
    const order: string[] = []
    const h = harness({ teardownCapture: () => { order.push("teardown") } })
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: 0 })

    h.client.close()
    await tick()
    expect(h.client.getPhase()).toBe("closed")
    expect(order).toEqual(["teardown"]) // mic torn down on normal close
  })

  test("abort tears down the capture engine (F5)", async () => {
    const order: string[] = []
    const h = harness({ teardownCapture: () => { order.push("teardown") } })
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.client.abort("user_cancelled")
    await tick()
    expect(h.client.getPhase()).toBe("aborted")
    expect(order).toEqual(["teardown"])
  })

  test("expiry suspends then tears down capture exactly once", async () => {
    let teardowns = 0
    const order: string[] = []
    const h = harness({
      sessionTtlMs: 5_000,
      suspendCapture: async () => { order.push("suspend") },
      teardownCapture: () => { teardowns += 1; order.push("teardown") },
    })
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: 0 })

    h.timers.now += 6_000 // past sessionExpiresAt
    h.sockets[0]!.remoteClose(1006)
    await tick()
    await tick()
    expect(h.client.getPhase()).toBe("expired")
    expect(order).toEqual(["suspend", "teardown"]) // flush before full stop
    expect(teardowns).toBe(1)

    h.client.close() // a competing terminal path must not tear down again
    await tick()
    expect(teardowns).toBe(1)
  })

  test("two socket losses during one pending suspension call suspendCapture once", async () => {
    let suspends = 0
    const resolvers: (() => void)[] = []
    const resumed: string[] = []
    const h = harness({
      resumeCapture: async (d) => { resumed.push(d.id) },
      suspendCapture: () => { suspends += 1; return new Promise<void>((r) => resolvers.push(r)) },
    })
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: 0 })

    h.sockets[0]!.remoteClose(1006) // loss #1 → suspend #1 (pending)
    await tick()
    await h.timers.flush() // reconnect → socket #1
    h.sockets[1]!.open() // resume awaits suspend #1
    h.sockets[1]!.remoteClose(1006) // loss #2 WHILE suspend #1 still pending
    await tick()
    expect(suspends).toBe(1) // must NOT start a second concurrent suspendCapture

    resolvers[0]!() // settle suspend #1
    await h.timers.flush() // reconnect → socket #2
    h.sockets[h.sockets.length - 1]!.open()
    await tick()
    await tick()
    expect(suspends).toBe(1) // still exactly one suspend for the whole gap
    expect(resumed.length).toBe(1) // only the current socket resumed
  })

  test("competing close + capture-failure paths tear down capture once", async () => {
    let teardowns = 0
    const h = harness({
      resumeCapture: async () => { throw new Error("mic busy") },
      suspendCapture: async () => {},
      teardownCapture: () => { teardowns += 1 },
    })
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: 0 })

    h.sockets[0]!.remoteClose(1006)
    await h.timers.flush()
    h.sockets[1]!.open() // resume fails → capture_failed → teardown
    await tick()
    await tick()
    expect(h.client.getPhase()).toBe("capture_failed")
    expect(teardowns).toBe(1)

    h.client.close() // competing terminal path
    await tick()
    expect(teardowns).toBe(1) // teardown invoked once across both paths
  })

  test("a socket lost during resumeCapture never overlaps with the next suspend (F2 serialized)", async () => {
    const events: string[] = []
    const resumeResolvers: (() => void)[] = []
    const h = harness({
      resumeCapture: async () => {
        events.push("resume:start")
        await new Promise<void>((resolve) => resumeResolvers.push(resolve)) // block activation
        events.push("resume:end")
      },
      suspendCapture: async () => {
        events.push("suspend:start")
        await tick() // async deactivate/flush
        events.push("suspend:end")
      },
    })
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: 0 })

    h.sockets[0]!.remoteClose(1006) // gap #1 → suspend #1
    await h.timers.flush() // reconnect → socket #1
    h.sockets[1]!.open() // resume runs after suspend #1, then BLOCKS mid-activation
    await tick()
    await tick()

    h.sockets[1]!.remoteClose(1006) // lose the replacement WHILE resume is activating
    await tick()
    resumeResolvers[0]!() // finish the (now superseded) activation
    await h.timers.flush()
    await tick()
    await tick()

    // Serialized: the second suspend starts only AFTER resume fully ends — never
    // concurrently — and capture ends suspended (last event is a suspend).
    expect(events).toEqual(["suspend:start", "suspend:end", "resume:start", "resume:end", "suspend:start", "suspend:end"])
    expect(h.client.getPhase()).not.toBe("live")
  })

  test("terminal shutdown during a blocked resume stops capture and prevents later reactivation", async () => {
    const events: string[] = []
    let resumeCalls = 0
    let teardownCalls = 0
    const resumeResolvers: (() => void)[] = []
    const h = harness({
      captureTeardownTimeoutMs: 50,
      resumeCapture: async () => {
        resumeCalls += 1
        events.push("resume:start")
        await new Promise<void>((resolve) => resumeResolvers.push(resolve)) // block mid-activation
        events.push("resume:end")
      },
      suspendCapture: async () => { events.push("suspend") },
      teardownCapture: () => { teardownCalls += 1; events.push("teardown") },
    })
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: 0 })

    h.sockets[0]!.remoteClose(1006) // gap → suspend
    await h.timers.flush() // reconnect → socket #1
    h.sockets[1]!.open() // resume runs after suspend, then BLOCKS
    await tick()
    await tick()
    expect(events).toEqual(["suspend", "resume:start"])

    h.client.close() // explicit terminal shutdown WHILE resume is activating
    await tick()
    await h.timers.flush() // force the bounded teardown (resume still blocked)
    await tick()
    await tick()
    expect(teardownCalls).toBe(1)
    expect(h.client.getPhase()).toBe("closed")

    resumeResolvers[0]!() // release the superseded resume
    await tick()
    await tick()
    // Capture stays stopped: resume was not re-invoked, teardown stayed once, and
    // no activation/suspension occurred AFTER the teardown.
    expect(resumeCalls).toBe(1)
    expect(teardownCalls).toBe(1)
    const afterTeardown = events.slice(events.indexOf("teardown") + 1)
    expect(afterTeardown.filter((e) => e === "resume:start" || e === "suspend")).toEqual([])
  })

  test("terminal teardown bypasses a hung suspendCapture after a bounded wait (F1)", async () => {
    let tornDown = false
    const h = harness({
      captureTeardownTimeoutMs: 50,
      suspendCapture: () => new Promise<void>(() => {}), // never resolves
      teardownCapture: () => { tornDown = true },
    })
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: 0 })

    h.sockets[0]!.remoteClose(1006) // suspend starts and HANGS
    await tick()
    h.client.close() // terminal → teardown must bound-wait the hung flush, then proceed
    await tick()
    expect(tornDown).toBe(false) // still waiting on the bounded timeout

    await h.timers.flush() // fire the teardown timeout (+ no-op reconnect timer)
    await tick()
    await tick()
    expect(tornDown).toBe(true) // teardown proceeded despite the hung suspendCapture
  })

  test("does not proactively reconnect at the token-refresh point (live socket persists)", async () => {
    // The server never re-checks the gateway token on an established socket
    // (it gates on session expiry, not token expiry), so there is no proactive
    // token-refresh reconnect — closing a healthy socket to refresh caused a
    // recurring grading outage. Advancing past the old refresh point must NOT
    // create a new session or socket; the live socket simply persists.
    const h = harness({ tokenTtlMs: 12_000 })
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()
    expect(h.client.getPhase()).toBe("live")

    await h.timers.flush() // previously fired the token-refresh timer → reconnect; now a no-op
    expect(h.idempotencyKeys).toHaveLength(1) // no re-creation
    expect(h.sockets).toHaveLength(1) // no new socket
    expect(h.client.getPhase()).toBe("live") // uninterrupted
  })

  test("a disconnect after session expiry ends the session without reconnecting", async () => {
    const h = harness({ sessionTtlMs: 5_000 })
    await h.client.start({ postId: "post-1" })
    h.sockets[0]!.open()

    h.timers.now += 6_000 // past sessionExpiresAt
    h.sockets[0]!.remoteClose(1006)
    expect(h.client.getPhase()).toBe("expired")
    await h.timers.flush()
    expect(h.idempotencyKeys).toHaveLength(1) // no reconnect/re-create
  })

  test("drops audio when not live", async () => {
    const h = harness()
    await h.client.start({ postId: "post-1" })
    h.client.setCaptureAnchor({ captureMs: 0, playbackRate: 1, songMs: 0 })
    // before open (connecting)
    h.client.pushAudio(new Uint8Array(320).buffer, 0)
    h.sockets[0]!.open()
    h.client.close()
    h.client.pushAudio(new Uint8Array(320).buffer, 0) // after close
    expect(h.sockets[0]!.binarySent()).toHaveLength(0)
    expect(h.client.getPhase()).toBe("closed")
  })
})
