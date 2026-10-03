import { describe, expect, test, vi } from "vitest";
import { createCaptureFailureBoundary, videoAdmissionProblem } from "./capture-failure";

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

describe("saying what is wrong with a video", () => {
  const usable = {
    container: "video/mp4", hasVideo: true, hasAudio: true, videoCodec: "avc", audioCodec: "aac",
    durationSeconds: 12, maxDurationSeconds: 180,
  } as const;

  test("accepts a usable video", () => {
    expect(videoAdmissionProblem(usable)).toBeNull();
    expect(videoAdmissionProblem({ ...usable, container: "video/quicktime" })).toBeNull();
  });

  test("a video that is too short says so and how short", () => {
    expect(videoAdmissionProblem({ ...usable, durationSeconds: 1.2 })).toBe("That video is shorter than 3 seconds. Record or choose a longer one.");
  });

  test("a video that is too long says so without quoting a range the product does not use", () => {
    const message = videoAdmissionProblem({ ...usable, durationSeconds: 400 });
    expect(message).toBe("That video is too long. Choose a shorter one.");
    expect(message).not.toMatch(/180|3–/);
  });

  test("a video without sound and a video in an unusable format are told apart", () => {
    expect(videoAdmissionProblem({ ...usable, hasAudio: false, audioCodec: null })).toBe("That video has no sound. Choose one with audio.");
    for (const broken of [
      { container: "video/webm" }, { hasVideo: false, videoCodec: null }, { videoCodec: "hevc" }, { audioCodec: "opus" },
      { durationSeconds: Number.NaN },
    ]) {
      expect(videoAdmissionProblem({ ...usable, ...broken })).toBe("That video’s format isn’t supported. Choose an MP4 or MOV recorded on a phone.");
    }
  });

  test("no message names a codec", () => {
    for (const broken of [{ container: "video/webm" }, { durationSeconds: 1 }, { durationSeconds: 999 }, { hasAudio: false }]) {
      expect(videoAdmissionProblem({ ...usable, ...broken }) ?? "").not.toMatch(/H\.264|AAC|WebM/);
    }
  });
});


test("aborting duration measurement disposes its decoder input", async () => {
  const { Input } = await import("mediabunny");
  const { measureVideoDuration } = await import("./capture");
  let finish!: (track: null) => void;
  const track = vi.spyOn(Input.prototype, "getPrimaryVideoTrack").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const dispose = vi.spyOn(Input.prototype, "dispose");
  const controller = new AbortController();
  try {
    const measured = measureVideoDuration(new File(["take"], "take.mp4", { type: "video/mp4" }), controller.signal);
    controller.abort();
    expect(dispose).toHaveBeenCalled();
    finish(null);
    expect(await measured).toBeNull();
  } finally { track.mockRestore(); dispose.mockRestore(); }
});
