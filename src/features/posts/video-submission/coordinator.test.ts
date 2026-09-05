import { webcrypto } from "node:crypto";
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

function setup(source = reservation) {
  vi.stubGlobal("crypto", webcrypto);
  let stored: PendingVideo | null = null;
  let current = initial;
  let posts = 0;
  let loseFinalize = true;
  let key = 0;
  const commands: VideoCommand[] = [];
  const results = new Map<string, VideoCommandResult>();
  const storage: VideoStorage = {
    async load() { return stored; }, async save(record) { stored = record; }, async remove() { stored = null; },
  };
  const transport: VideoTransport = {
    async read() { return current; },
    async execute(command) {
      commands.push(command);
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
  return { create, begin, commands, fetchImpl, storage, posts: () => posts };
}

describe("video operation replay", () => {
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
