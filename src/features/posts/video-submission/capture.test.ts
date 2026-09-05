import { describe, expect, test, vi } from "vitest";
import { createCaptureFailureBoundary } from "./capture-failure";

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
