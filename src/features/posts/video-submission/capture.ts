import { ALL_FORMATS, BlobSource, BufferTarget, canEncodeAudio, canEncodeVideo, Input,
  MediaStreamAudioTrackSource, MediaStreamVideoTrackSource, Mp4OutputFormat, Output, Quality } from "mediabunny";

import { GUIDED_TAKE_MAX_DURATION_SECONDS } from "./clip-duration";
import { createCaptureFailureBoundary, VideoCaptureError } from "./capture-failure";
import { isPortraitFrame, portraitCoverCrop, PORTRAIT_HEIGHT, PORTRAIT_WIDTH } from "./portrait-crop";
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

/** Measures a chosen file's **video** duration in whole milliseconds, or null
 * when it cannot be read. The container duration is not the video's: an
 * aligned take carries the captured audio, which is not trimmed and can run
 * longer than the video, and a container that lasts longer than the excerpt
 * says nothing about whether the video itself covers it. The local duration
 * guard uses the video track; the sealed server probe remains authoritative. */
export async function measureVideoDuration(file: File): Promise<number | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    const duration = video === null ? await input.computeDuration() : await video.computeDuration();
    return Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1_000) : null;
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

const DEFAULT_MAX_DURATION_SECONDS = 180;

/** Browser admission is an early UX check; the sealed server probe stays authoritative. */
export async function inspectVideoFile(
  file: File,
  options: { readonly maxDurationSeconds?: number; readonly requirePortrait?: boolean } = {},
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
    if (options.requirePortrait && !isPortraitFrame(await video.getDisplayWidth(), await video.getDisplayHeight())) {
      throw new VideoCaptureError("invalid_media", "The camera did not save a 9:16 video. Retake before uploading.");
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
  /** A live camera stream already shown as the preview. The recording takes
   * ownership of it and stops its tracks when the take ends. */
  readonly stream?: MediaStream;
}

async function assertRecordingCapability(): Promise<void> {
  if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia
    || !("VideoEncoder" in globalThis) || !("AudioEncoder" in globalThis)
    || !await canEncodeVideo("avc", { width: 720, height: 1280, quality: videoQuality,
      fullCodecString: "avc1.42e01f", hardwareAcceleration: "prefer-hardware", latencyMode: "realtime" })
    || !await canEncodeAudio("aac", { numberOfChannels: 1, sampleRate: 48_000, quality: audioQuality })) {
    throw new VideoCaptureError("capability_unavailable", "This browser cannot record H.264 and AAC; choose a compatible video instead");
  }
}

async function openCameraStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: { ideal: 30, max: 30 } }, audio: true });
  } catch { throw new VideoCaptureError("camera_denied", "Camera or microphone access is unavailable; upload remains available"); }
}

/** Opens the camera for a live preview before recording, so the capture
 * screen shows the camera immediately. The caller stops the tracks when the
 * preview is abandoned; a recording started from it stops them itself. */
export async function openCameraPreview(): Promise<MediaStream> {
  await assertRecordingCapability();
  return openCameraStream();
}

/** Android may return landscape camera frames even for exact portrait media
 * constraints. Encode the same centered cover shown in the 9:16 viewfinder;
 * never silently upload the underlying landscape track. */
async function portraitEncodingTrack(stream: MediaStream, camera: MediaStreamVideoTrack, onFrameFailure: () => void): Promise<{
  readonly track: MediaStreamVideoTrack;
  readonly width: number;
  readonly height: number;
  readonly close: () => void;
}> {
  const settings = camera.getSettings();
  if (isPortraitFrame(settings.width ?? 0, settings.height ?? 0)) {
    return { track: camera, width: settings.width!, height: settings.height!, close: () => undefined };
  }
  const canvas = document.createElement("canvas");
  canvas.width = PORTRAIT_WIDTH;
  canvas.height = PORTRAIT_HEIGHT;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context || typeof canvas.captureStream !== "function") {
    throw new VideoCaptureError("capability_unavailable", "This browser cannot save portrait video. Choose a compatible browser.");
  }
  const cameraView = document.createElement("video");
  cameraView.muted = true;
  cameraView.playsInline = true;
  cameraView.srcObject = stream;
  let frame = 0;
  let closed = false;
  let firstFrame = true;
  let outputTrack: MediaStreamVideoTrack | undefined;
  const close = () => {
    closed = true;
    cancelAnimationFrame(frame);
    outputTrack?.stop();
    cameraView.pause();
    cameraView.srcObject = null;
  };
  try {
    await cameraView.play();
    if (!cameraView.videoWidth || !cameraView.videoHeight) {
      throw new VideoCaptureError("capability_unavailable", "The camera did not provide a usable frame. Retake the video.");
    }
    const paint = () => {
      if (closed) return;
      try {
        const crop = portraitCoverCrop(cameraView.videoWidth, cameraView.videoHeight);
        context.drawImage(cameraView, crop.x, crop.y, crop.width, crop.height,
          0, 0, PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
      } catch {
        if (firstFrame) throw new VideoCaptureError("capability_unavailable", "The camera could not draw a portrait frame.");
        onFrameFailure();
        return;
      }
      firstFrame = false;
      frame = requestAnimationFrame(paint);
    };
    paint();
    outputTrack = canvas.captureStream(30).getVideoTracks()[0];
    if (!outputTrack) {
      throw new VideoCaptureError("capability_unavailable", "The camera could not provide a portrait recording track.");
    }
    return { track: outputTrack, width: PORTRAIT_WIDTH, height: PORTRAIT_HEIGHT, close };
  } catch (error) {
    close();
    throw error;
  }
}

export async function startOriginalVideoCapture(input: OriginalVideoCaptureInput): Promise<VideoCaptureSession> {
  await assertRecordingCapability();
  const stream = input.stream ?? await openCameraStream();
  const target = new BufferTarget();
  const output = new Output({ target, format: new Mp4OutputFormat({ fastStart: "fragmented", minimumFragmentDuration: 1 }) });
  let ended = false;
  let frameFailed = false;
  let orientationLocked = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let portraitTrack: Awaited<ReturnType<typeof portraitEncodingTrack>> | undefined;
  const tracks = stream.getTracks();
  const orientation = globalThis.screen?.orientation;
  const release = () => {
    clearInterval(timer);
    orientation?.removeEventListener("change", rotated);
    portraitTrack?.track.removeEventListener("ended", trackEnded);
    portraitTrack?.close();
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
    portraitTrack = await portraitEncodingTrack(stream, video, () => {
      frameFailed = true;
      boundary.fail("encoder_failed", "Portrait frame processing stopped. Retake the video.");
    });
    const { width, height } = portraitTrack;
    const pixels = width * height;
    const profile = pixels <= 640 * 480 ? "avc1.42e01e" : pixels <= 720 * 1280 ? "avc1.42e01f" : "avc1.42e028";
    if (pixels > 1080 * 1920 || !await canEncodeVideo("avc", { width, height, quality: videoQuality,
      fullCodecString: profile, hardwareAcceleration: "prefer-hardware", latencyMode: "realtime" })
      || !await canEncodeAudio("aac", { numberOfChannels: sound.channelCount ?? 1, sampleRate: sound.sampleRate ?? 48_000, quality: audioQuality })) {
      throw new VideoCaptureError("capability_unavailable", "The actual camera and microphone configuration is unsupported");
    }
    const videoSource = new MediaStreamVideoTrackSource(portraitTrack.track, { codec: "avc", quality: videoQuality,
      fullCodecString: profile, keyFrameInterval: 1, hardwareAcceleration: "prefer-hardware", latencyMode: "realtime" },
    { frameRate: 30 });
    const audioSource = new MediaStreamAudioTrackSource(audio, { codec: "aac", quality: audioQuality });
    dimensionsChanged = () => {
      const current = video.getSettings();
      return current.width !== settings.width || current.height !== settings.height;
    };
    boundary.observe(videoSource.errorPromise);
    boundary.observe(audioSource.errorPromise);
    if (portraitTrack.track !== video) portraitTrack.track.addEventListener("ended", trackEnded, { once: true });
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
          if (frameFailed) throw new VideoCaptureError("encoder_failed", "Portrait frame processing stopped. Retake the video.");
          if (!target.buffer) throw new VideoCaptureError("encoder_failed", "Capture did not finalize a file");
          return await inspectVideoFile(new File([target.buffer], "original-video.mp4", { type: "video/mp4" }), {
            // Only the app's own guided take is allowed its tail guard; a
            // chosen file keeps the ordinary admission bound.
            maxDurationSeconds: GUIDED_TAKE_MAX_DURATION_SECONDS,
            requirePortrait: true,
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
