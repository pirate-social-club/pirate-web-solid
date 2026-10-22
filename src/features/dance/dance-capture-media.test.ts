// @vitest-environment node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input } from "mediabunny";
import { describe, expect, test } from "vitest";
import { boundDanceRecording } from "./dance-capture-media";

async function recording(name = "capture-prefix-avc-aac.mp4") {
  return new File([new Uint8Array(await readFile(new URL(`./fixtures/${name}`, import.meta.url)))], "camera.mp4", { type: "video/mp4" });
}
async function inspect(file: File) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack(), audio = await input.getPrimaryAudioTrack();
    if (!video || !audio) throw new Error("fixture_missing_tracks");
    const packets = async (track: typeof video | typeof audio) => {
      const result = [];
      for await (const packet of new EncodedPacketSink(track).packets()) result.push({
        timestamp: packet.timestamp, duration: packet.duration, type: packet.type,
        digest: createHash("sha256").update(packet.data).digest("hex"),
      });
      return result;
    };
    return { video: await packets(video), audio: await packets(audio),
      ends: await Promise.all([video.computeDuration(), audio.computeDuration(), input.computeDuration()]) };
  } finally { input.dispose(); }
}
const options = () => ({ bodyEndMs: 8013, maximumBytes: 1_000_000, signal: new AbortController().signal, assertCurrent() {} });

describe("Dance keeps its cue and complete body", () => {
  test("bounds a non-frame-aligned end without shifting or re-encoding any prefix packet", async () => {
    const file = await recording(), before = await inspect(file);
    const bounded = await boundDanceRecording({ ...options(), file });
    const after = await inspect(bounded);
    expect(bounded.type).toBe("video/mp4");
    expect(after.ends.map(end => Math.round(end * 1000))).toEqual([8013, 8013, 8013]);
    for (const kind of ["video", "audio"] as const) {
      const prefix = before[kind].filter(packet => packet.timestamp >= 0 && packet.timestamp < 8.013);
      expect(after[kind]).toHaveLength(prefix.length);
      for (let i = 0; i < prefix.length; i++) {
        const original = prefix[i]!, saved = after[kind][i]!;
        expect(saved.digest).toBe(original.digest);
        expect(saved.type).toBe(original.type);
        expect(saved.timestamp).toBeCloseTo(original.timestamp, 5);
        expect(saved.duration).toBeCloseTo(Math.min(original.duration, 8.013 - original.timestamp), 5);
      }
      // The assigned two-second cue still exists at the original origin.
      expect(after[kind][0]!.timestamp).toBe(0);
      expect(after[kind].filter(packet => packet.timestamp < 2).map(packet => packet.digest))
        .toEqual(prefix.filter(packet => packet.timestamp < 2).map(packet => packet.digest));
    }
  });

  test("refuses a take that does not cover the frozen body end", async () => {
    await expect(boundDanceRecording({ ...options(), file: await recording(), bodyEndMs: 9000 })).rejects.toThrow("dance_capture_incomplete");
  });

  test("refuses an encoded result above the frozen byte bound", async () => {
    await expect(boundDanceRecording({ ...options(), file: await recording(), maximumBytes: 100 })).rejects.toThrow("dance_capture_size_exceeded");
  });

  test("refuses negative AAC pre-roll rather than discard decoder history", async () => {
    const file = await recording("capture-preroll-avc-aac.mp4");
    expect((await inspect(file)).audio[0]!.timestamp).toBeLessThan(0);
    await expect(boundDanceRecording({ ...options(), file, bodyEndMs: 50 })).rejects.toThrow("dance_capture_incomplete");
  });

  test.each(["abort", "authority"])("%s during media preparation cannot return a recording", async reason => {
    const controller = new AbortController();
    let current = true;
    const pending = boundDanceRecording({ ...options(), file: await recording(), signal: controller.signal,
      assertCurrent() { if (!current) throw new Error("capture_revoked"); } });
    queueMicrotask(() => { if (reason === "abort") controller.abort(); else current = false; });
    await expect(pending).rejects.toThrow();
  });
});
