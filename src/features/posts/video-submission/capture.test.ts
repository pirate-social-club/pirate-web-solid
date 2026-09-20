import { describe, expect, test, vi } from "vitest";
import { createCaptureFailureBoundary } from "./capture-failure";
import { readPrimaryVideoDurationMs } from "./capture";

function fixture(changed = false) {
  let ended = false;
  const onFailure = vi.fn(); const release = vi.fn(); const cancel = vi.fn().mockResolvedValue(undefined);
  const boundary = createCaptureFailureBoundary({ ended: () => ended, markEnded: () => { ended = true; },
    dimensionsChanged: () => changed, onFailure, release, cancel });
  return { boundary, onFailure, release, cancel, stop: () => { ended = true; }, ended: () => ended };
}
describe("capture source failure boundary", () => {
  test.each(["video", "audio"])("%s failure ends capture before Stop", async () => {
    const f = fixture(); f.boundary.observe(Promise.reject(new Error("source failed"))); await Promise.resolve();
    expect(f.ended()).toBe(true); expect(f.release).toHaveBeenCalledOnce(); expect(f.cancel).toHaveBeenCalledOnce();
    expect(f.onFailure).toHaveBeenCalledWith(expect.objectContaining({ reason: "encoder_failed" }));
  });
  test("dimension changes are typed as an orientation retake", async () => {
    const f = fixture(true); f.boundary.observe(Promise.reject(new Error("sample size"))); await Promise.resolve();
    expect(f.onFailure).toHaveBeenCalledWith(expect.objectContaining({ reason: "orientation_lost" }));
  });
  test("concurrent source failures release and notify exactly once", async () => {
    const f = fixture(); f.boundary.observe(Promise.reject(new Error("video"))); f.boundary.observe(Promise.reject(new Error("audio"))); await Promise.resolve();
    expect(f.release).toHaveBeenCalledOnce(); expect(f.onFailure).toHaveBeenCalledOnce();
  });
  test("late encoder errors still reject finalization after Stop", async () => {
    const f = fixture(); f.stop(); f.boundary.observe(Promise.reject(new Error("late"))); await Promise.resolve();
    expect(() => f.boundary.assertFinalized()).toThrow(); expect(f.onFailure).not.toHaveBeenCalled();
  });
  test("orientation event can end the take without waiting on an encoder", () => {
    const f = fixture(); f.boundary.fail("orientation_lost", "Retake");
    expect(f.ended()).toBe(true); expect(f.release).toHaveBeenCalledOnce();
  });
});

describe("clip duration authority", () => {
  test("measures the primary video track, never the container", async () => {
    const containerDuration = vi.fn(async () => 10);
    const read = (videoDuration: number | null) => {
      const input = {
        computeDuration: containerDuration,
        getPrimaryVideoTrack: async () =>
          videoDuration === null ? null : { computeDuration: async () => videoDuration },
      };
      return readPrimaryVideoDurationMs(input);
    };
    // The container is deliberately longer than the video, as a retained AAC
    // tail makes it; the reader must return the video's own duration and never
    // consult the container.
    await expect(read(4.5)).resolves.toBe(4_500);
    await expect(read(null)).resolves.toBeNull();
    await expect(read(Number.POSITIVE_INFINITY)).resolves.toBeNull();
    await expect(read(0)).resolves.toBeNull();
    expect(containerDuration).not.toHaveBeenCalled();
  });
});
