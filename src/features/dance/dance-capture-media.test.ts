// @vitest-environment node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ALL_FORMATS, BlobSource, BufferTarget, EncodedAudioPacketSource, EncodedPacketSink, EncodedVideoPacketSource, Input, Mp4OutputFormat, Output } from "mediabunny";
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
const options = () => ({ window: { body_start_ms: 2000, body_end_ms: 8013, cue: { kind: "arms_t" as const, start_ms: 0, end_ms: 2000, hold_ms: 1000 } }, maximumBytes: 1_000_000, signal: new AbortController().signal, assertCurrent() {} });

// Preserve the real encoded fixture bytes while simulating each source's
// first-arrival offset. No codec, frame interpolation or generated timestamp
// from the implementation under test is involved.
async function offsetRecording(videoStart: number, audioStart: number): Promise<File> {
  const input = new Input({ source: new BlobSource(await recording()), formats: ALL_FORMATS });
  const target = new BufferTarget(), output = new Output({ target, format: new Mp4OutputFormat({ fastStart: "fragmented" }) });
  const video = new EncodedVideoPacketSource("avc"), audio = new EncodedAudioPacketSource("aac");
  output.addVideoTrack(video); output.addAudioTrack(audio);
  try {
    const v = await input.getPrimaryVideoTrack(), a = await input.getPrimaryAudioTrack();
    if (!v || !a) throw new Error("fixture_missing_tracks");
    const videoConfig = await v.getDecoderConfig(), audioConfig = await a.getDecoderConfig();
    if (!videoConfig || !audioConfig) throw new Error("fixture_missing_config");
    await output.start();
    await Promise.all([
      (async () => { let first = true; for await (const packet of new EncodedPacketSink(v).packets()) {
        await video.add(packet.clone({ timestamp: packet.timestamp + videoStart }), first ? { decoderConfig: videoConfig } : undefined); first = false;
      } video.close(); })(),
      (async () => { let first = true; for await (const packet of new EncodedPacketSink(a).packets()) {
        await audio.add(packet.clone({ timestamp: packet.timestamp + audioStart }), first ? { decoderConfig: audioConfig } : undefined); first = false;
      } audio.close(); })(),
    ]);
    await output.finalize();
    if (!target.buffer) throw new Error("fixture_missing_output");
    return new File([target.buffer], "offset.mp4", { type: "video/mp4" });
  } finally { input.dispose(); }
}

describe("Dance keeps its cue and complete body", () => {
  test.each([0, 0.025, 0.25])("no-pose keeps video zero and its natural microphone offset %ss without retiming", async audioStart => {
    const original = await offsetRecording(0, audioStart), before = await inspect(original);
    const noPose = { body_start_ms: 0, body_end_ms: 8013, cue: { kind: "none" as const, start_ms: 0, end_ms: 0, hold_ms: 0 } };
    const after = await inspect(await boundDanceRecording({ ...options(), window: noPose, file: original }));
    expect(after.ends.map(end => Math.round(end * 1000))).toEqual([8013, 8013, 8013]);
    for (const kind of ["video", "audio"] as const) {
      const prefix = before[kind].filter(packet => packet.timestamp >= 0 && packet.timestamp < 8.013);
      expect(after[kind].map(packet => [packet.timestamp, packet.digest])).toEqual(prefix.map(packet => [packet.timestamp, packet.digest]));
    }
  });
  test.each([[0.001, 0], [0, 0.251], [0.025, 0.025]])("no-pose refuses missing video zero or late mic: %s/%s", async (videoStart, audioStart) => {
    const noPose = { body_start_ms: 0, body_end_ms: 8013, cue: { kind: "none" as const, start_ms: 0, end_ms: 0, hold_ms: 0 } };
    await expect(boundDanceRecording({ ...options(), window: noPose, file: await offsetRecording(videoStart, audioStart) })).rejects.toThrow("dance_capture_incomplete");
  });
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

  test.each([[0.25, 0], [0, 0.25], [1, 0]])("preserves natural source starts video=%s audio=%s when the full cue and body still fit", async (videoStart, audioStart) => {
    const original = await offsetRecording(videoStart, audioStart), before = await inspect(original);
    const after = await inspect(await boundDanceRecording({ ...options(), file: original }));
    expect(after.video[0]!.timestamp).toBeCloseTo(videoStart, 5);
    expect(after.audio[0]!.timestamp).toBeCloseTo(audioStart, 5);
    expect(after.ends.map(end => Math.round(end * 1000))).toEqual([8013, 8013, 8013]);
    for (const kind of ["video", "audio"] as const) {
      expect(after[kind].map(packet => packet.digest)).toEqual(before[kind].filter(packet => packet.timestamp < 8.013).map(packet => packet.digest));
    }
  });

  test.each([[1.01, 0], [0, 2.01], [0.25, 0.25]])("refuses missing cue, missing body audio or absent common zero: video=%s audio=%s", async (videoStart, audioStart) => {
    await expect(boundDanceRecording({ ...options(), file: await offsetRecording(videoStart, audioStart) })).rejects.toThrow("dance_capture_incomplete");
  });

  test("refuses a take that does not cover the frozen body end", async () => {
    const input = options();
    await expect(boundDanceRecording({ ...input, file: await recording(), window: { ...input.window, body_end_ms: 9000 } })).rejects.toThrow("dance_capture_incomplete");
  });

  test("refuses an encoded result above the frozen byte bound", async () => {
    await expect(boundDanceRecording({ ...options(), file: await recording(), maximumBytes: 100 })).rejects.toThrow("dance_capture_size_exceeded");
  });

  test("refuses negative AAC pre-roll rather than discard decoder history", async () => {
    const file = await recording("capture-preroll-avc-aac.mp4");
    expect((await inspect(file)).audio[0]!.timestamp).toBeLessThan(0);
    await expect(boundDanceRecording({ ...options(), file, window: { body_start_ms: 25, body_end_ms: 50, cue: { kind: "arms_t", start_ms: 0, end_ms: 25, hold_ms: 10 } } })).rejects.toThrow("dance_capture_incomplete");
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
