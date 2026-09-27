import { describe, expect, test } from "vitest";
import { isPortraitFrame, portraitCoverCrop } from "./portrait-crop";

describe("portrait camera framing", () => {
  test("crops the Pixel's landscape frames to the centered 9:16 viewfinder", () => {
    expect(portraitCoverCrop(1280, 720)).toEqual({ x: 437.5, y: 0, width: 405, height: 720 });
  });

  test("keeps native 9:16 frames and center-crops taller frames", () => {
    expect(portraitCoverCrop(720, 1280)).toEqual({ x: 0, y: 0, width: 720, height: 1280 });
    expect(portraitCoverCrop(720, 1600)).toEqual({ x: 0, y: 160, width: 720, height: 1280 });
  });

  test("requires exact portrait dimensions for an encoded phone take", () => {
    expect(isPortraitFrame(720, 1280)).toBe(true);
    expect(isPortraitFrame(1080, 1920)).toBe(true);
    expect(isPortraitFrame(1280, 720)).toBe(false);
    expect(isPortraitFrame(720, 1278)).toBe(false);
    expect(() => portraitCoverCrop(0, 720)).toThrow();
  });
});
