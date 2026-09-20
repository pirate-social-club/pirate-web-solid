import { ALL_FORMATS, BlobSource, BufferTarget, canEncodeAudio, canEncodeVideo, Input,
  MediaStreamAudioTrackSource, MediaStreamVideoTrackSource, Mp4OutputFormat, Output, Quality } from "mediabunny";

import { createCaptureFailureBoundary, VideoCaptureError } from "./capture-failure";
export { VideoCaptureError } from "./capture-failure";
export interface VideoCaptureSession {
  readonly stream: MediaStream;
  /** The capture timeline's origin in `performance.now()` terms: the moment
   * the encoder began. The guide's start is measured against this, not against
   * the later moment the session object reached its caller. */
  readonly captureOriginMs: number;
  readonly stop: () => Promise<File>;
  readonly cancel: () => Promise<void>;
}

const videoQuality = new Quality({ bitrate: 4_000_000 });
const audioQuality = new Quality({ bitrate: 128_000 });

/** Measures a chosen file's duration in whole milliseconds, or null when the
 * container cannot answer. The local duration guard uses this; the sealed
 * server probe remains authoritative. */
export async function measureVideoDuration(file: File): Promise<number | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const duration = await input.computeDuration();
    return Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1_000) : null;
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

const DEFAULT_MAX_DURATION_SECONDS = 180;
/** A guided take is recorded a little past the excerpt's end so the render's
 * exact cut cannot land on a frame the recording never produced. */
const GUIDED_CAPTURE_MAX_DURATION_SECONDS = 181.5;

/** Browser admission is an early UX check; the sealed server probe stays authoritative. */
export async function inspectVideoFile(
  file: File,
  options: { readonly maxDurationSeconds?: number } = {},
): Promise<File> {
  const declared = file.type.toLowerCase().split(";")[0]?.trim();
  const type = declared || (/\.mov$/iu.test(file.name) ? "video/quicktime" : /\.mp4$/iu.test(file.name) ? "video/mp4" : "");
  if ((type !== "video/mp4" && type !== "video/quicktime") || file.size < 1 || file.size > 500 * 1024 * 1024) {
    throw new VideoCaptureError("invalid_media", "Choose an MP4 or MOV no larger than 500 MiB");
  }
  const maxDuration = options.maxDurationSeconds ?? DEFAULT_MAX_DURATION_SECONDS;
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    const container = (await input.getMimeType()).split(";")[0]?.trim();
    const duration = await input.computeDuration();
    if (!video || !audio || (container !== "video/mp4" && container !== "video/quicktime")
      || await video.getCodec() !== "avc" || await audio.getCodec() !== "aac"
      || !Number.isFinite(duration) || duration < 3 || duration > maxDuration) {
      throw new VideoCaptureError("invalid_media", "Video must contain H.264 and AAC and last 3–180 seconds");
    }
    return new File([file], file.name, { type, lastModified: file.lastModified });
  } finally { input.dispose(); }
}

/** Production composition of the proved 1.55.5 fMP4 path; no WebM or AAC polyfill. */
export interface OriginalVideoCaptureInput {
  readonly onFailure: (error: VideoCaptureError) => void;
  readonly onLimit: () => void;
  /** Recording stops at this length. A guided take passes the excerpt plus
   * its tail guard; without one the platform limit stands. */
  readonly limitMs?: number;
}

export async function startOriginalVideoCapture(input: OriginalVideoCaptureInput): Promise<VideoCaptureSession> {
  if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia
    || !("VideoEncoder" in globalThis) || !("AudioEncoder" in globalThis)
    || !await canEncodeVideo("avc", { width: 720, height: 1280, quality: videoQuality,
      fullCodecString: "avc1.42e01f", hardwareAcceleration: "prefer-hardware", latencyMode: "realtime" })
    || !await canEncodeAudio("aac", { numberOfChannels: 1, sampleRate: 48_000, quality: audioQuality })) {
    throw new VideoCaptureError("capability_unavailable", "This browser cannot record H.264 and AAC; choose a compatible video instead");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: { ideal: 30, max: 30 } }, audio: true });
  } catch { throw new VideoCaptureError("camera_denied", "Camera or microphone access is unavailable; upload remains available"); }
  const target = new BufferTarget();
  const output = new Output({ target, format: new Mp4OutputFormat({ fastStart: "fragmented", minimumFragmentDuration: 1 }) });
  let ended = false;
  let orientationLocked = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const tracks = stream.getTracks();
  const orientation = globalThis.screen?.orientation;
  const release = () => {
    clearInterval(timer);
    orientation?.removeEventListener("change", rotated);
    for (const track of tracks) { track.removeEventListener("ended", trackEnded); track.stop(); }
    if (orientationLocked) orientation?.unlock();
  };
  let dimensionsChanged = () => false;
  const boundary = createCaptureFailureBoundary({ ended: () => ended, markEnded: () => { ended = true; },
    dimensionsChanged: () => dimensionsChanged(), release, cancel: () => output.cancel(), onFailure: input.onFailure });
  const rotated = () => boundary.fail("orientation_lost", "The phone rotated during capture. Retake in one orientation.");
  const trackEnded = () => boundary.fail("encoder_failed", "A camera or microphone source ended. Retake the video.");
  try {
    const video = stream.getVideoTracks()[0]; const audio = stream.getAudioTracks()[0];
    if (!video || !audio) throw new VideoCaptureError("capability_unavailable", "Both camera and microphone tracks are required");
    const settings = video.getSettings(); const sound = audio.getSettings();
    const width = settings.width ?? 720; const height = settings.height ?? 1280;
    const pixels = width * height;
    const profile = pixels <= 640 * 480 ? "avc1.42e01e" : pixels <= 720 * 1280 ? "avc1.42e01f" : "avc1.42e028";
    if (pixels > 1080 * 1920 || !await canEncodeVideo("avc", { width, height, quality: videoQuality,
      fullCodecString: profile, hardwareAcceleration: "prefer-hardware", latencyMode: "realtime" })
      || !await canEncodeAudio("aac", { numberOfChannels: sound.channelCount ?? 1, sampleRate: sound.sampleRate ?? 48_000, quality: audioQuality })) {
      throw new VideoCaptureError("capability_unavailable", "The actual camera and microphone configuration is unsupported");
    }
    const videoSource = new MediaStreamVideoTrackSource(video, { codec: "avc", quality: videoQuality,
      fullCodecString: profile, keyFrameInterval: 1, hardwareAcceleration: "prefer-hardware", latencyMode: "realtime" });
    const audioSource = new MediaStreamAudioTrackSource(audio, { codec: "aac", quality: audioQuality });
    dimensionsChanged = () => {
      const current = video.getSettings();
      return current.width !== settings.width || current.height !== settings.height;
    };
    boundary.observe(videoSource.errorPromise);
    boundary.observe(audioSource.errorPromise);
    output.addVideoTrack(videoSource); output.addAudioTrack(audioSource);
    // Locking is optional platform functionality. Changes are take-ending even
    // when the browser refuses the lock. Backgrounding alone has no handler.
    if (orientation && "lock" in orientation && typeof orientation.lock === "function") {
      try { await orientation.lock(orientation.type); orientationLocked = true; } catch { /* change guard remains active */ }
    }
    orientation?.addEventListener("change", rotated);
    for (const track of tracks) track.addEventListener("ended", trackEnded, { once: true });
    await output.start();
    if (ended) throw new VideoCaptureError("encoder_failed", "Capture ended before recording could start");
    // The exposed capture origin: the encoder is running and the file's
    // timeline begins here. Everything after this in setup time must not be
    // counted as recorded lead-in.
    const captureOriginMs = performance.now();
    const started = captureOriginMs;
    const limitMs = input.limitMs === undefined
      ? 180_000
      : Math.min(Math.max(3_000, input.limitMs), 181_500);
    let limitReported = false;
    timer = setInterval(() => {
      const current = video.getSettings();
      if (current.width !== settings.width || current.height !== settings.height) { rotated(); return; }
      if (!limitReported && performance.now() - started >= limitMs) { limitReported = true; input.onLimit(); }
    }, 100);
    return {
      stream,
      captureOriginMs,
      async stop() {
        if (ended) throw new VideoCaptureError("encoder_failed", "Capture has already ended");
        ended = true; clearInterval(timer);
        try {
          await output.finalize();
          boundary.assertFinalized();
          if (!target.buffer) throw new VideoCaptureError("encoder_failed", "Capture did not finalize a file");
          return await inspectVideoFile(new File([target.buffer], "original-video.mp4", { type: "video/mp4" }), {
            // Only the app's own guided take is allowed its tail guard; a
            // chosen file keeps the ordinary admission bound.
            maxDurationSeconds: GUIDED_CAPTURE_MAX_DURATION_SECONDS,
          });
        } finally { release(); }
      },
      async cancel() { if (ended) return; ended = true; try { await output.cancel(); } finally { release(); } },
    };
  } catch (error) {
    ended = true; release(); await output.cancel().catch(() => {});
    throw error;
  }
}
