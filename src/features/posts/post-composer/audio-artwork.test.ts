import { describe, expect, test } from "bun:test";

import { extractEmbeddedAudioArtworkBytes } from "./audio-artwork";

function textBytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

function synchsafeBytes(value: number): number[] {
  return [
    (value >> 21) & 0x7f,
    (value >> 14) & 0x7f,
    (value >> 7) & 0x7f,
    value & 0x7f,
  ];
}

function uint24Bytes(value: number): number[] {
  return [
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ];
}

function uint32Bytes(value: number): number[] {
  return [
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ];
}

function id3v22PicTag(imageBytes: number[]): Uint8Array {
  const frameBody = [
    0,
    ...textBytes("JPG"),
    3,
    0,
    ...imageBytes,
  ];
  const frame = [
    ...textBytes("PIC"),
    ...uint24Bytes(frameBody.length),
    ...frameBody,
  ];

  return new Uint8Array([
    ...textBytes("ID3"),
    2,
    0,
    0,
    ...synchsafeBytes(frame.length),
    ...frame,
  ]);
}

function id3v23ApicTag(imageBytes: number[]): Uint8Array {
  const frameBody = [
    0,
    ...textBytes("image/png"),
    0,
    3,
    0,
    ...imageBytes,
  ];
  const frame = [
    ...textBytes("APIC"),
    ...uint32Bytes(frameBody.length),
    0,
    0,
    ...frameBody,
  ];

  return new Uint8Array([
    ...textBytes("ID3"),
    3,
    0,
    0,
    ...synchsafeBytes(frame.length),
    ...frame,
  ]);
}

function id3v24ApicTag(imageBytes: number[]): Uint8Array {
  const frameBody = [
    0,
    ...textBytes("image/webp"),
    0,
    3,
    0,
    ...imageBytes,
  ];
  const frame = [
    ...textBytes("APIC"),
    ...synchsafeBytes(frameBody.length),
    0,
    0,
    ...frameBody,
  ];

  return new Uint8Array([
    ...textBytes("ID3"),
    4,
    0,
    0,
    ...synchsafeBytes(frame.length),
    ...frame,
  ]);
}

describe("extractEmbeddedAudioArtworkBytes", () => {
  test("extracts PIC image bytes from an ID3v2.2 tag", () => {
    const artwork = extractEmbeddedAudioArtworkBytes(id3v22PicTag([0xff, 0xd8, 0xff, 0xe0]));

    expect(artwork?.mimeType).toBe("image/jpeg");
    expect(Array.from(artwork?.data ?? [])).toEqual([0xff, 0xd8, 0xff, 0xe0]);
  });

  test("extracts APIC image bytes from an ID3v2.3 tag", () => {
    const artwork = extractEmbeddedAudioArtworkBytes(id3v23ApicTag([0x89, 0x50, 0x4e, 0x47]));

    expect(artwork?.mimeType).toBe("image/png");
    expect(Array.from(artwork?.data ?? [])).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  test("extracts APIC image bytes from an ID3v2.4 tag with synchsafe frame size", () => {
    const artwork = extractEmbeddedAudioArtworkBytes(id3v24ApicTag([0x52, 0x49, 0x46, 0x46]));

    expect(artwork?.mimeType).toBe("image/webp");
    expect(Array.from(artwork?.data ?? [])).toEqual([0x52, 0x49, 0x46, 0x46]);
  });

  test("returns null when no ID3 artwork is present", () => {
    expect(extractEmbeddedAudioArtworkBytes(new Uint8Array([0xff, 0xfb, 0x90, 0x64]))).toBeNull();
  });
});

