import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import { openCameraPreview, startOriginalVideoCapture, type VideoCaptureError } from "../../src/features/posts/video-submission/capture";
import { alignGuidedTake } from "../../src/features/posts/video-submission/guided-take-alignment";

// Local, no-upload proof of the portrait capture path on a real browser.
// Query parameters:
//   seconds=N     length of the take (default 4)
//   hide=sim      simulate the page being hidden 1.5 s into the take
//   hide=real     wait for the page to be really hidden (e.g. the Home key)
//   auto=1        start without a tap (desktop automation only)
//   res=fhd       ask the camera for landscape 1920x1080 instead of the app's
//                 current request, to compare crop resolution
const params = new URLSearchParams(location.search);
const seconds = Number(params.get("seconds") ?? 4);
const hideMode = params.get("hide");
const resolution = params.get("res");

const button = document.querySelector<HTMLButtonElement>("#record")!;
const result = document.querySelector<HTMLElement>("#result")!;
const viewfinder = document.querySelector<HTMLVideoElement>("#viewfinder")!;
const recorded = document.querySelector<HTMLImageElement>("#recorded")!;
const playback = document.querySelector<HTMLVideoElement>("#playback")!;

/** Delay from a camera frame's capture to the page seeing it: the canvas path
 * paints from this same point, so its frames trail the microphone by about
 * this much plus one paint interval. */
function sampleLatency(video: HTMLVideoElement, samples: number[]): () => void {
  let active = true;
  const tick = (now: number, metadata: VideoFrameCallbackMetadata) => {
    if (!active) return;
    if (typeof metadata.captureTime === "number") samples.push(now - metadata.captureTime);
    video.requestVideoFrameCallback(tick);
  };
  if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(tick);
  return () => { active = false; };
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]! * 10) / 10;
}

function luminance(canvas: HTMLCanvasElement | OffscreenCanvas): Float32Array {
  const context = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const out = new Float32Array(canvas.width * canvas.height);
  for (let i = 0; i < out.length; i += 1) out[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
  return out;
}

function meanAbsDiff(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i]! - b[i]!);
  return Math.round((sum / a.length) * 100) / 100;
}

async function analyze(file: File) {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    if (!video || !audio) throw new Error("Recorded file lacks video or audio");
    // Small frames are enough to see motion and pacing.
    const small = new CanvasSink(video, { width: 72, height: 128, fit: "fill", poolSize: 0 });
    const timestamps: number[] = [];
    const frames: Float32Array[] = [];
    for await (const wrapped of small.canvases()) {
      timestamps.push(wrapped.timestamp);
      frames.push(luminance(wrapped.canvas));
    }
    const gaps = timestamps.slice(1).map((t, i) => (t - timestamps[i]!) * 1000);
    const consecutive = frames.slice(1).map((f, i) => meanAbsDiff(frames[i]!, f));
    const full = await new CanvasSink(video).getCanvas(0.5);
    if (full) {
      const canvas = full.canvas;
      const blob = canvas instanceof HTMLCanvasElement
        ? await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"))
        : await canvas.convertToBlob({ type: "image/png" });
      if (blob) recorded.src = URL.createObjectURL(blob);
    }
    return {
      width: await video.getDisplayWidth(),
      height: await video.getDisplayHeight(),
      videoCodec: await video.getCodec(),
      audioCodec: await audio.getCodec(),
      videoDurationSeconds: await video.computeDuration(),
      frames: frames.length,
      frameRate: Math.round((frames.length / Math.max(0.001, (timestamps.at(-1)! - timestamps[0]!))) * 10) / 10,
      maxFrameGapMs: Math.round(Math.max(0, ...gaps)),
      // Motion: the first and last frames differ, and frames keep changing.
      firstToLastDiff: frames.length > 1 ? meanAbsDiff(frames[0]!, frames.at(-1)!) : 0,
      unchangedFrameRatio: consecutive.length
        ? Math.round((consecutive.filter(d => d < 0.05).length / consecutive.length) * 100) / 100
        : 1,
      bytes: file.size,
    };
  } finally { input.dispose(); }
}

async function run() {
  button.disabled = true;
  result.textContent = "Opening camera…";
  const stream = resolution === "fhd"
    ? await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } },
      audio: true,
    })
    : await openCameraPreview();
  viewfinder.srcObject = stream;
  await viewfinder.play().catch(() => undefined);
  const camera = stream.getVideoTracks()[0]!.getSettings();
  const latency: number[] = [];
  const stopSampling = sampleLatency(viewfinder, latency);
  let failure: VideoCaptureError | undefined;
  const session = await startOriginalVideoCapture({
    stream,
    onFailure: error => { failure = error; },
    onLimit: () => undefined,
    limitMs: (seconds + 1) * 1000,
  });
  result.textContent = "Recording locally…";
  const base = { request: resolution ?? "app", camera: { width: camera.width, height: camera.height, frameRate: camera.frameRate } };

  if (hideMode) {
    if (hideMode === "sim") {
      await new Promise(resolve => setTimeout(resolve, 1_500));
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      delete (document as { visibilityState?: unknown }).visibilityState;
    } else {
      await new Promise<void>(resolve => {
        const onChange = () => { if (document.visibilityState === "visible") { document.removeEventListener("visibilitychange", onChange); resolve(); } };
        document.addEventListener("visibilitychange", onChange);
      });
    }
    let stopOutcome = "file";
    try { await session.stop(); } catch (error) { stopOutcome = `rejected: ${error instanceof Error ? error.message : "unknown"}`; }
    stopSampling();
    result.textContent = JSON.stringify({
      ...base,
      hide: hideMode,
      failureReason: failure?.reason ?? null,
      failureMessage: failure?.message ?? null,
      stopOutcome,
      tracksStopped: stream.getTracks().every(track => track.readyState === "ended"),
    });
    return;
  }

  await new Promise(resolve => setTimeout(resolve, seconds * 1_000));
  if (failure) throw failure;
  const file = await session.stop();
  stopSampling();
  const tracksStopped = stream.getTracks().every(track => track.readyState === "ended");
  const aligned = await alignGuidedTake(file, 200);
  const analysis = await analyze(file);
  const alignedInput = new Input({ source: new BlobSource(aligned.file), formats: ALL_FORMATS });
  try {
    const alignedVideo = await alignedInput.getPrimaryVideoTrack();
    result.textContent = JSON.stringify({
      ...base,
      ...analysis,
      tracksStopped,
      cameraToPageLatencyMs: { samples: latency.length, median: percentile(latency, 0.5), p90: percentile(latency, 0.9) },
      alignment: {
        aligned: aligned.aligned,
        trimmedMs: aligned.trimmedMs,
        width: await alignedVideo?.getDisplayWidth(),
        height: await alignedVideo?.getDisplayHeight(),
      },
    });
  } finally { alignedInput.dispose(); }
  playback.src = URL.createObjectURL(aligned.file);
}

button.addEventListener("click", () => {
  void run()
    .catch(error => { result.textContent = `Failed: ${error instanceof Error ? error.message : "unknown capture error"}`; })
    .finally(() => { button.disabled = false; });
});
if (params.get("auto") === "1") button.click();
