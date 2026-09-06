import { webcrypto } from "node:crypto";
import { ApiClientError } from "@pirate/api-client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { VideoCoordinator, type PendingVideo, type VideoStorage } from "./coordinator";
import type { OriginalVideoReservation, VideoSnapshot } from "./contracts";
import type { VideoCommand, VideoCommandResult, VideoTransport } from "./transport";

afterEach(() => vi.unstubAllGlobals());
const reservation: OriginalVideoReservation = {
  reservation_id: "reservation", track: "video", intent: "original_audio", slot: "primary_video",
  status: "awaiting_upload", author_persona_id: "persona", ingest_policy_revision: 1,
  upload: { method: "MULTIPART", upload_id: "upload", part_size_bytes: 10, part_count: 1,
    expires_at: "2099-01-01T00:00:00Z", parts: [{ part_number: 1, url: "https://upload.example/1", expires_at: "2099-01-01T00:00:00Z" }] },
};
const initial: VideoSnapshot = {
  submission_id: "submission", author_persona: { object: "persona", persona_id: "persona", display_name: null, avatar_ref: null, primary_public_handle: null },
  href: "/media-post-submissions/submission", track: "video", intent: "original_audio", creation_revision: 1,
  video_revision: 0, caption: "", updated_at: "2026-09-05T00:00:00Z", status: "processing", phase: "awaiting_upload",
};

type MutableVideoTestTransport = { -readonly [Key in keyof VideoTransport]: VideoTransport[Key] };

function setup(source = reservation) {
  vi.stubGlobal("crypto", webcrypto);
  let stored: PendingVideo | null = null;
  let current = initial;
  let posts = 0;
  let loseFinalize = true;
  let key = 0;
  const commands: VideoCommand[] = [];
  let rejection: { kind: VideoCommand["kind"]; error: Error } | null = null;
  const results = new Map<string, VideoCommandResult>();
  const storage: VideoStorage = {
    async exclusive(work) { return work(); },
    async load() { return stored; }, async save(record) { stored = record; }, async remove() { stored = null; },
  };
  const transport: MutableVideoTestTransport = {
    async read() { return current; },
    async execute(command) {
      commands.push(command);
      if (rejection?.kind === command.kind) { const error = rejection.error; rejection = null; throw error; }
      const old = results.get(command.input.body.idempotency_key);
      if (old) return old;
      if (command.kind === "reserve") { results.set(command.input.body.idempotency_key, source); return source; }
      if (command.kind === "renew") return { ...source, upload: { ...source.upload,
        parts: source.upload.parts.filter(part => command.input.body.part_numbers.includes(part.part_number))
          .map(part => ({ ...part, expires_at: "2099-01-01T00:00:00Z" })),
      } };
      if (command.kind === "finalize") {
        posts++;
        current = { ...initial, status: "published", creation_revision: 2, video_revision: 1, published_resource: { post_id: "post", href: "/posts/post" } };
        results.set(command.input.body.idempotency_key, current);
        if (loseFinalize) { loseFinalize = false; throw new Error("Lost finalize response"); }
      }
      results.set(command.input.body.idempotency_key, current);
      return current;
    },
  };
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { headers: { etag: "part-etag" } }));
  const create = (principalId = "account") => new VideoCoordinator({ principalId, storage, transport, fetchImpl, createId: () => `key-${++key}` });
  const begin = (coordinator: VideoCoordinator) => coordinator.begin({ communityId: "community", personaId: "persona", caption: "", rating: "general", file: new File(["video"], "take.mp4", { type: "video/mp4" }) });
  return { create, begin, commands, fetchImpl, storage, transport, posts: () => posts,
    rejectNext: (kind: VideoCommand["kind"], error: Error) => { rejection = { kind, error }; },
  };
}

function rejected(status = 400, retryable = false) {
  return new ApiClientError({ status, code: "bad_request", name: "BadRequest", retryable },
    { error: { code: "bad_request", message: "Request refused", retryable } });
}

describe("video operation replay", () => {
  test.each(["reserve", "start"] as const)("definitive %s rejection restores without replay and requires explicit editing", async kind => {
    const fixture = setup(); const first = fixture.create(); fixture.rejectNext(kind, rejected());
    if (kind === "reserve") await expect(fixture.begin(first)).rejects.toThrow("Request refused");
    else { await fixture.begin(first); await expect(first.submit()).rejects.toThrow("Request refused"); }
    expect(first.current?.pending).toBeNull();
    expect(first.current?.rejection?.command.kind).toBe(kind);
    const count = fixture.commands.length;
    const resumed = fixture.create(); await resumed.restore();
    expect(fixture.commands).toHaveLength(count);
    await expect(resumed.submit()).rejects.toThrow(/rejected/);
    expect(fixture.commands).toHaveLength(count);
    const draft = await resumed.discardRejected(); expect(draft.file.name).toBe("take.mp4");
    expect(await fixture.storage.load()).toBeNull();
    await fixture.begin(resumed);
    expect(fixture.commands.at(-1)?.input.body.idempotency_key).not.toBe(fixture.commands[0]?.input.body.idempotency_key);
  });
  test.each([new Error("offline"), rejected(409), rejected(429, true), rejected(503, true)])("uncertain/conflicting rejection is retained and cannot be discarded: %s", async error => {
    const fixture = setup(); const first = fixture.create(); fixture.rejectNext("reserve", error);
    await expect(fixture.begin(first)).rejects.toThrow();
    expect(first.current?.pending?.command.kind).toBe("reserve"); expect(first.current?.rejection).toBeUndefined();
    await expect(first.discardRejected()).rejects.toThrow(/definitively/);
    expect(await fixture.storage.load()).not.toBeNull();
  });
  test("a rejected finalize never authorizes discarding a server-owned operation", async () => {
    const fixture = setup(); const first = fixture.create(); await fixture.begin(first); fixture.rejectNext("finalize", rejected());
    await expect(first.submit()).rejects.toThrow("Request refused");
    await expect(first.discardRejected()).rejects.toThrow(/definitively/);
    expect(first.current?.snapshot?.submission_id).toBe("submission");
  });
  test("partial renewal preserves the complete durable upload plan", async () => {
    const fixture = setup({ ...reservation, upload: { ...reservation.upload, part_size_bytes: 3, part_count: 2,
      parts: [1, 2].map(part_number => ({ part_number, url: `https://upload.example/${part_number}`,
        expires_at: part_number === 1 ? "2099-01-01T00:00:00Z" : "2000-01-01T00:00:00Z" })),
    } });
    const first = fixture.create(); await fixture.begin(first);
    await expect(first.submit()).rejects.toThrow("Lost finalize response");
    expect(first.current?.reservation?.upload.parts.map(part => part.part_number)).toEqual([1, 2]);
    expect(first.current?.receipts).toHaveLength(2);
    expect(fixture.commands.filter(command => command.kind === "renew")).toHaveLength(1);
  });
  test("lost finalize replays the exact command after restore without a second upload or post", async () => {
    const fixture = setup(); const first = fixture.create();
    await fixture.begin(first);
    await expect(first.submit()).rejects.toThrow("Lost finalize response");
    expect(first.current?.pending?.command.kind).toBe("finalize");
    const retained = JSON.stringify(first.current?.pending?.command);
    const resumed = fixture.create(); await resumed.restore();
    expect(resumed.current?.snapshot?.status).toBe("published");
    expect(JSON.stringify(fixture.commands.at(-1))).toBe(retained);
    expect(fixture.posts()).toBe(1); expect(fixture.fetchImpl).toHaveBeenCalledTimes(1);
    await resumed.submit(); expect(fixture.posts()).toBe(1);
  });
  test("another account cannot restore or dispatch the saved video", async () => {
    const fixture = setup(); await fixture.begin(fixture.create());
    const count = fixture.commands.length;
    await expect(fixture.create("other-account").restore()).rejects.toThrow(/different account/);
    expect(fixture.commands).toHaveLength(count);
  });
  test("a second draft cannot replace the retained attempt", async () => {
    const fixture = setup(); const first = fixture.create(); await fixture.begin(first);
    await expect(fixture.begin(fixture.create())).rejects.toThrow(/retained video/);
    expect(fixture.commands).toHaveLength(1);
  });
  test("a changed saved finalize command is rejected before replay", async () => {
    const fixture = setup(); const first = fixture.create(); await fixture.begin(first);
    await expect(first.submit()).rejects.toThrow();
    const saved = await fixture.storage.load();
    if (!saved?.pending) throw new Error("Missing test command");
    await fixture.storage.save({ ...saved, pending: { ...saved.pending, digest: "0".repeat(64) } });
    const count = fixture.commands.length;
    await expect(fixture.create().restore()).rejects.toThrow(/digest/);
    expect(fixture.commands).toHaveLength(count);
  });
});


test.each(["start", "read"] as const)("pause during deferred %s saves the response but prevents upload and finalize", async boundary => {
  const fixture = setup(); const coordinator = fixture.create(); await fixture.begin(coordinator);
  let release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  const execute = fixture.transport.execute; const read = fixture.transport.read;
  if (boundary === "start") fixture.transport.execute = async command => {
    if (command.kind === "start") { entered(); await waiting; } return execute(command);
  };
  else fixture.transport.read = async id => { entered(); await waiting; return read(id); };
  const operation = coordinator.submit(); const stopped = expect(operation).rejects.toThrow(/paused/);
  await started; coordinator.pauseUpload(); release(); await stopped;
  expect(coordinator.current?.snapshot?.submission_id).toBe("submission");
  expect(coordinator.current?.pending).toBeNull(); expect(fixture.fetchImpl).not.toHaveBeenCalled();
  expect(fixture.commands.some(command => command.kind === "finalize")).toBe(false);
  fixture.transport.execute = execute; fixture.transport.read = read;
  await expect(coordinator.submit()).rejects.toThrow("Lost finalize response");
  expect(fixture.fetchImpl).toHaveBeenCalledTimes(1);
});
