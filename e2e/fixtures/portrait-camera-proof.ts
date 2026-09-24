import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import { startOriginalVideoCapture } from "../../src/features/posts/video-submission/capture";
import { alignGuidedTake } from "../../src/features/posts/video-submission/guided-take-alignment";

const button = document.querySelector<HTMLButtonElement>("#record")!;
const result = document.querySelector<HTMLElement>("#result")!;
const playback = document.querySelector<HTMLVideoElement>("#playback")!;

button.addEventListener("click", () => {
  button.disabled = true;
  result.textContent = "Opening camera…";
  void (async () => {
    let sourceFailure: Error | undefined;
    const session = await startOriginalVideoCapture({
      onFailure: error => { sourceFailure = error; result.textContent = error.message; },
      onLimit: () => undefined,
      limitMs: 5_000,
    });
    result.textContent = "Recording locally…";
    await new Promise(resolve => setTimeout(resolve, 4_000));
    if (sourceFailure) throw sourceFailure;
    const file = await session.stop();
    const tracksStopped = session.stream.getTracks().every(track => track.readyState === "ended");
    const aligned = await alignGuidedTake(file, 200);
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const alignedInput = new Input({ source: new BlobSource(aligned.file), formats: ALL_FORMATS });
    try {
      const video = await input.getPrimaryVideoTrack();
      const audio = await input.getPrimaryAudioTrack();
      const alignedVideo = await alignedInput.getPrimaryVideoTrack();
      if (!video || !audio) throw new Error("Recorded file lacks video or audio");
      result.textContent = JSON.stringify({
        width: await video.getDisplayWidth(),
        height: await video.getDisplayHeight(),
        videoCodec: await video.getCodec(),
        audioCodec: await audio.getCodec(),
        videoDurationSeconds: await video.computeDuration(),
        bytes: file.size,
        tracksStopped,
        alignment: {
          aligned: aligned.aligned,
          trimmedMs: aligned.trimmedMs,
          width: await alignedVideo?.getDisplayWidth(),
          height: await alignedVideo?.getDisplayHeight(),
        },
      });
      playback.src = URL.createObjectURL(aligned.file);
    } finally { input.dispose(); alignedInput.dispose(); }
  })().catch(error => { result.textContent = `Failed: ${error instanceof Error ? error.message : "unknown capture error"}`; })
    .finally(() => { button.disabled = false; });
});
