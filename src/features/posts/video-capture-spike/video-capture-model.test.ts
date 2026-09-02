import { describe, expect, test } from "vitest";

import {
  analyzePacketReordering,
  deriveCopyPreview,
  maximumKeyframeGapUs,
  normalizeVideoMimeType,
  selectConstrainedBaselineProfile,
  snapStartToKeyframeUs,
  type VideoPacketFact,
} from "./video-capture-model";

describe("video capture MIME normalization", () => {
  test.each([
    ['Video/MP4; codecs="avc1.42E01E, mp4a.40.2"', "video/mp4", ["h264", "aac"]],
    ["video/webm;codecs=vp09.00.10.08,opus", "video/webm", ["vp9", "opus"]],
    ["video/webm; codecs=vp8", "video/webm", ["vp8"]],
  ] as const)("normalizes %s", (observed, mediaType, codecs) => {
    expect(normalizeVideoMimeType(observed)).toEqual({
      mediaType,
      codecs,
      observedMimeType: observed,
    });
  });

  test.each([
    "",
    "video/webm",
    "video/mp4;codecs=vp9,opus",
    "video/webm;codecs=vp9,vp8,opus",
    "video/webm;codecs=vp9,opus;codecs=vp9,opus",
    "video/webm;codecs=vp9,unknown",
    "video/webm;codecs=vp9;boundary=x",
  ])("rejects ambiguous or contradictory declaration %s", (observed) => {
    expect(() => normalizeVideoMimeType(observed)).toThrow();
  });
});

describe("copy-target preview", () => {
  const packets: readonly VideoPacketFact[] = [
    { sequenceNumber: 0, timestampUs: 0, durationUs: 33_333, type: "key", byteLength: 100 },
    { sequenceNumber: 1, timestampUs: 66_666, durationUs: 33_333, type: "delta", byteLength: 50 },
    { sequenceNumber: 2, timestampUs: 33_333, durationUs: 33_333, type: "delta", byteLength: 50 },
    { sequenceNumber: 3, timestampUs: 99_999, durationUs: 33_333, type: "delta", byteLength: 50 },
    { sequenceNumber: 4, timestampUs: 1_000_000, durationUs: 33_333, type: "key", byteLength: 100 },
    { sequenceNumber: 5, timestampUs: 1_033_333, durationUs: 33_333, type: "delta", byteLength: 50 },
  ];

  test("snaps start to an emitted keyframe and preserves decode ordering", () => {
    expect(snapStartToKeyframeUs(packets, 1_010_000)).toBe(1_000_000);
    expect(deriveCopyPreview(packets, 0, 120_000)).toEqual({
      sourceStartUs: 0,
      requestedEndUs: 120_000,
      effectiveEndUs: 99_999,
      effectiveDurationUs: 99_999,
      tailShortfallUs: 20_001,
      packetSequenceNumbers: [0, 1, 2],
    });
  });

  test("does not snap the requested end to the next keyframe", () => {
    const preview = deriveCopyPreview(packets, 1_000_000, 50_000);
    expect(preview.effectiveEndUs).toBe(1_033_333);
    expect(preview.tailShortfallUs).toBe(16_667);
    expect(preview.packetSequenceNumbers).toEqual([4]);
  });

  test("requires an exact emitted keyframe start", () => {
    expect(() => deriveCopyPreview(packets, 1_000_001, 50_000)).toThrow("emitted keyframe");
  });

  test("detects presentation reordering in decode order", () => {
    expect(analyzePacketReordering(packets)).toMatchObject({
      verdict: "reordering_present",
      hasFrameReordering: true,
      presentationTimestampRegressionsInDecodeOrder: 1,
      decodeOrderSequenceNumbers: [0, 1, 2, 3, 4, 5],
      presentationOrderSequenceNumbers: [0, 2, 1, 3, 4, 5],
    });
  });

  test("proves no reordering only with defined sequence numbers and monotonic PTS", () => {
    const monotonic = packets.slice(0, 1).concat([
      { ...packets[2]!, sequenceNumber: 1 },
      { ...packets[1]!, sequenceNumber: 2 },
    ]);
    expect(analyzePacketReordering(monotonic)).toMatchObject({
      verdict: "no_reordering",
      hasFrameReordering: false,
      presentationTimestampRegressionsInDecodeOrder: 0,
    });
    expect(analyzePacketReordering([{ ...packets[0]!, sequenceNumber: -1 }])).toMatchObject({
      verdict: "indeterminate",
      hasFrameReordering: null,
    });
    expect(analyzePacketReordering([
      packets[0]!,
      { ...packets[1]!, timestampUs: packets[0]!.timestampUs },
    ])).toMatchObject({
      verdict: "indeterminate",
      duplicatePresentationTimestamps: 1,
    });
  });

  test("measures the actual maximum keyframe gap", () => {
    expect(maximumKeyframeGapUs(packets)).toBe(1_000_000);
    expect(maximumKeyframeGapUs(packets.slice(0, 1))).toBeNull();
  });
});

describe("Constrained Baseline capture matrix", () => {
  test.each([
    [640, 480, 30, "3.0", "avc1.42e01e"],
    [720, 1280, 30, "3.1", "avc1.42e01f"],
    [1080, 1920, 30, "4.0", "avc1.42e028"],
  ] as const)("selects the lowest bounded level for %sx%s at %s fps", (width, height, frameRate, level, codec) => {
    expect(selectConstrainedBaselineProfile(width, height, frameRate)).toMatchObject({
      level,
      fullCodecString: codec,
    });
  });

  test("rejects a track beyond the frozen spike matrix", () => {
    expect(() => selectConstrainedBaselineProfile(2160, 3840, 30)).toThrow("exceeds");
  });
});
