import { describe, expect, test } from "vitest";

import {
  deriveCopyPreview,
  normalizeVideoMimeType,
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
});
