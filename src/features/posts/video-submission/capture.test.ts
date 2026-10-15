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
    width: 1080, height: 1920,
    averageFrameRate: 30,
    durationSeconds: 12, maxDurationSeconds: 180,
  } as const;

  test("accepts a usable video", () => {
    expect(videoAdmissionProblem(usable)).toBeNull();
    expect(videoAdmissionProblem({ ...usable, container: "video/quicktime" })).toBeNull();
  });

  test.each([[1920, 1080], [1080, 1920], [1920, 1920]])("accepts %s by %s at the server's dimension limit", (width, height) => {
    expect(videoAdmissionProblem({ ...usable, width, height })).toBeNull();
  });

  test.each([[1936, 1080], [1080, 1936], [1921, 1920], [3840, 2160]])("refuses %s by %s with an actionable dimension limit", (width, height) => {
    expect(videoAdmissionProblem({ ...usable, width, height })).toBe("Choose a video no wider or taller than 1920 pixels.");
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1080.5])("refuses unreadable dimensions: %s", dimension => {
    expect(videoAdmissionProblem({ ...usable, width: dimension })).toContain("dimensions couldn’t be read");
    expect(videoAdmissionProblem({ ...usable, height: dimension })).toContain("dimensions couldn’t be read");
  });

  test.each([24, 30_000 / 1_001, 60_000 / 1_001, 60, 60.0004])("accepts average rate %s with the server's millihertz rounding", averageFrameRate => {
    expect(videoAdmissionProblem({ ...usable, averageFrameRate })).toBeNull();
  });

  test.each([60.0006, 61, 120, 240])("refuses average rate %s with an actionable limit", averageFrameRate => {
    expect(videoAdmissionProblem({ ...usable, averageFrameRate })).toBe("Choose a video at 60 frames per second or lower.");
  });

  test.each([0, -1, 0.0004, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE])("refuses unreadable average rate: %s", averageFrameRate => {
    expect(videoAdmissionProblem({ ...usable, averageFrameRate })).toBe("That video’s frame rate couldn’t be read. Choose another video.");
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

test.each([[1936, 1080], [1080, 1936], [1920, 1080]])("file admission reads coded dimensions %s by %s and releases the input", async (width, height) => {
  const { Input } = await import("mediabunny");
  const { inspectVideoFile } = await import("./capture");
  type VideoTrack = NonNullable<Awaited<ReturnType<InstanceType<typeof Input>["getPrimaryVideoTrack"]>>>;
  type AudioTrack = NonNullable<Awaited<ReturnType<InstanceType<typeof Input>["getPrimaryAudioTrack"]>>>;
  // SAFETY: default file inspection calls only these video metadata methods; no decoder or portrait path uses this double.
  const video = { getCodec: async () => "avc", getCodedWidth: async () => width, getCodedHeight: async () => height,
    computePacketStats: async () => ({ averagePacketRate: 30 }) } as VideoTrack;
  // SAFETY: file inspection only reads the audio codec from this metadata double.
  const audio = { getCodec: async () => "aac" } as AudioTrack;
  const spies = [
    vi.spyOn(Input.prototype, "getPrimaryVideoTrack").mockResolvedValue(video),
    vi.spyOn(Input.prototype, "getPrimaryAudioTrack").mockResolvedValue(audio),
    vi.spyOn(Input.prototype, "getMimeType").mockResolvedValue("video/mp4"),
    vi.spyOn(Input.prototype, "computeDuration").mockResolvedValue(12),
  ];
  const dispose = vi.spyOn(Input.prototype, "dispose");
  try {
    const inspected = inspectVideoFile(new File(["take"], "take.mp4", { type: "video/mp4" }));
    if (Math.max(width, height) > 1920) {
      await expect(inspected).rejects.toMatchObject({ reason: "invalid_media", message: "Choose a video no wider or taller than 1920 pixels." });
    } else {
      await expect(inspected).resolves.toMatchObject({ name: "take.mp4", type: "video/mp4" });
    }
    expect(dispose).toHaveBeenCalledOnce();
  } finally { spies.forEach(spy => spy.mockRestore()); dispose.mockRestore(); }
});

test.each([60, 60.0006, 120, Number.NaN, "unreadable"])("file admission reads the full track average rate %s and releases the input", async rate => {
  const { Input } = await import("mediabunny");
  const { inspectVideoFile } = await import("./capture");
  type VideoTrack = NonNullable<Awaited<ReturnType<InstanceType<typeof Input>["getPrimaryVideoTrack"]>>>;
  type AudioTrack = NonNullable<Awaited<ReturnType<InstanceType<typeof Input>["getPrimaryAudioTrack"]>>>;
  const stats = vi.fn(async () => {
    if (typeof rate !== "number") throw new Error("Packet metadata unavailable");
    return { packetCount: 1_440, averagePacketRate: rate, averageBitrate: 128_000 };
  });
  const metadata: Pick<VideoTrack, "getCodec" | "getCodedWidth" | "getCodedHeight" | "computePacketStats"> = {
    getCodec: async () => "avc", getCodedWidth: async () => 1080, getCodedHeight: async () => 1920,
    computePacketStats: stats,
  };
  // SAFETY: default file inspection calls only these video metadata methods; it never decodes frames.
  const video = metadata as VideoTrack;
  // SAFETY: file inspection only reads the audio codec from this metadata double.
  const audio = { getCodec: async () => "aac" } as AudioTrack;
  const spies = [
    vi.spyOn(Input.prototype, "getPrimaryVideoTrack").mockResolvedValue(video),
    vi.spyOn(Input.prototype, "getPrimaryAudioTrack").mockResolvedValue(audio),
    vi.spyOn(Input.prototype, "getMimeType").mockResolvedValue("video/mp4"),
    vi.spyOn(Input.prototype, "computeDuration").mockResolvedValue(12),
  ];
  const dispose = vi.spyOn(Input.prototype, "dispose");
  try {
    const inspected = inspectVideoFile(new File(["take"], "take.mp4", { type: "video/mp4" }));
    if (rate === 60) {
      await expect(inspected).resolves.toMatchObject({ name: "take.mp4", type: "video/mp4" });
    } else {
      const message = typeof rate === "number" && Number.isFinite(rate)
        ? "Choose a video at 60 frames per second or lower."
        : "That video’s frame rate couldn’t be read. Choose another video.";
      await expect(inspected).rejects.toMatchObject({ reason: "invalid_media", message });
    }
    expect(stats).toHaveBeenCalledExactlyOnceWith();
    expect(dispose).toHaveBeenCalledOnce();
  } finally { spies.forEach(spy => spy.mockRestore()); dispose.mockRestore(); }
});
