import { describe, expect, test, vi } from "vitest";
import { reserveOriginalVideo, startVideo, type OriginalVideoReservation } from "./contracts";
import { uploadVideoParts } from "./multipart";

const future = "2099-01-01T00:00:00Z";
const reservation: OriginalVideoReservation = {
  track: "video", intent: "original_audio", slot: "primary_video", status: "awaiting_upload",
  reservation_id: "reservation", author_persona_id: "persona", ingest_policy_revision: 1,
  upload: { method: "MULTIPART", upload_id: "upload", part_size_bytes: 3, part_count: 2,
    expires_at: future, parts: [1, 2].map(part_number => ({ part_number, url: `https://upload.example/${part_number}`, expires_at: future })) },
};
const file = new Blob(["abcdef"]);

describe("original video boundary", () => {
  test("constructs only original audio without terms, song fields, or a title", () => {
    const reserve = reserveOriginalVideo({ communityId: "community", personaId: "persona", key: "reserve", file: { size: 6, type: "video/mp4" } });
    expect(reserve.body).toEqual({ persona_id: "persona", idempotency_key: "reserve", track: "video", slot: "primary_video", intent: "original_audio", expected_content_type: "video/mp4", expected_size_bytes: 6 });
    const start = startVideo({ communityId: "community", personaId: "persona", key: "start", reservation, caption: "", rating: "general" });
    expect(start.body).not.toHaveProperty("title");
    expect(start.body).not.toHaveProperty("intent");
  });
  test("rejects unsupported containers, unsafe sizes, and persona changes", () => {
    for (const type of ["video/webm", "video/*", "video/mp4; codecs=avc1"]) {
      expect(() => reserveOriginalVideo({ communityId: "community", personaId: "persona", key: "key", file: { type, size: 6 } })).toThrow();
    }
    expect(() => reserveOriginalVideo({ communityId: "community", personaId: "persona", key: "key", file: { type: "video/mp4", size: 0 } })).toThrow();
    expect(() => startVideo({ communityId: "community", personaId: "other", key: "key", reservation, caption: "", rating: "general" })).toThrow(/persona/);
  });
});

describe("durable video multipart boundary", () => {
  test("resumes acknowledged parts and saves the next receipt before reporting progress", async () => {
    const events: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { headers: { etag: '"second"' } }));
    const result = await uploadVideoParts({ reservation, file, receipts: [{ part_number: 1, etag: "first" }], fetchImpl,
      renew: vi.fn(), saveReceipt: async part => { events.push(`save-${part.part_number}`); },
      onProgress: sent => { events.push(`progress-${sent}`); },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0].toString()).toBe("https://upload.example/2");
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: "PUT", credentials: "omit", redirect: "error" });
    expect(events).toEqual(["progress-3", "save-2", "progress-6"]);
    expect(result).toEqual([{ part_number: 1, etag: "first" }, { part_number: 2, etag: "second" }]);
  });
  test("renews only an expired pending URL, not the acknowledged part", async () => {
    const renew = vi.fn().mockResolvedValue([reservation.upload.parts[1]]);
    await uploadVideoParts({ reservation: { ...reservation, upload: { ...reservation.upload, parts: reservation.upload.parts.map(p => ({ ...p, expires_at: "2000-01-01T00:00:00Z" })) } },
      file, receipts: [{ part_number: 1, etag: "first" }], renew, saveReceipt: async () => {},
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { headers: { etag: "second" } })),
    });
    expect(renew).toHaveBeenCalledExactlyOnceWith([2]);
  });
  test("does not acknowledge a successful PUT whose ETag is hidden by CORS", async () => {
    const saveReceipt = vi.fn();
    await expect(uploadVideoParts({ reservation, file, receipts: [], renew: vi.fn(), saveReceipt,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(new Response(null)),
    })).rejects.toThrow(/ETag/);
    expect(saveReceipt).not.toHaveBeenCalled();
  });
  test("stops on cancellation without uploading or renewing", async () => {
    const controller = new AbortController(); controller.abort();
    const fetchImpl = vi.fn<typeof fetch>(); const renew = vi.fn();
    await expect(uploadVideoParts({ reservation, file, receipts: [], renew, saveReceipt: vi.fn(), fetchImpl, signal: controller.signal })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled(); expect(renew).not.toHaveBeenCalled();
  });
  test("expired reservations cannot silently become new uploads", async () => {
    const fetchImpl = vi.fn<typeof fetch>(); const renew = vi.fn();
    await expect(uploadVideoParts({ reservation: { ...reservation, upload: { ...reservation.upload, expires_at: "2000-01-01T00:00:00Z" } }, file, receipts: [], renew, saveReceipt: vi.fn(), fetchImpl })).rejects.toThrow(/reservation expired/);
    expect(fetchImpl).not.toHaveBeenCalled(); expect(renew).not.toHaveBeenCalled();
  });
  test("rejects duplicate receipts and a mismatched part count before any PUT", async () => {
    for (const receipts of [[{ part_number: 1, etag: "a" }, { part_number: 1, etag: "b" }], [{ part_number: 3, etag: "a" }]]) {
      await expect(uploadVideoParts({ reservation, file, receipts, renew: vi.fn(), saveReceipt: vi.fn(), fetchImpl: vi.fn<typeof fetch>() })).rejects.toThrow(/receipts/);
    }
    await expect(uploadVideoParts({ reservation, file: new Blob(["a"]), receipts: [], renew: vi.fn(), saveReceipt: vi.fn(), fetchImpl: vi.fn<typeof fetch>() })).rejects.toThrow(/plan/);
  });
});
