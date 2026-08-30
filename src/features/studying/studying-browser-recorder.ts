import type { StudyingRecorder } from "./studying-route-model";

type SupportedContentType = Awaited<ReturnType<StudyingRecorder["stop"]>>["contentType"];

const CONTENT_TYPES: readonly SupportedContentType[] = ["audio/webm", "audio/mp4", "audio/ogg"];

function recordingContentType(recorder: MediaRecorder): SupportedContentType {
  const normalized = recorder.mimeType.split(";", 1)[0]?.toLowerCase();
  const supported = CONTENT_TYPES.find((candidate) => candidate === normalized);
  if (!supported) throw new Error("This browser does not expose a supported audio recording format.");
  return supported;
}

/** Browser microphone recorder that returns only API-accepted bounded audio formats. */
export function createStudyingBrowserRecorder(): StudyingRecorder {
  let recorder: MediaRecorder | undefined;
  let stream: MediaStream | undefined;
  let chunks: Blob[] = [];
  let startedAt = 0;

  const release = () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
    recorder = undefined;
  };

  return {
    async start() {
      if (!globalThis.navigator?.mediaDevices || typeof MediaRecorder === "undefined") {
        throw new Error("Voice recording is not available in this browser.");
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const contentType = CONTENT_TYPES.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      try {
        recorder = contentType
          ? new MediaRecorder(stream, { mimeType: contentType })
          : new MediaRecorder(stream);
        chunks = [];
        recorder.addEventListener("dataavailable", (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        });
        recorder.start();
        startedAt = performance.now();
      } catch (error) {
        release();
        throw error;
      }
    },
    async stop() {
      const current = recorder;
      if (!current || current.state === "inactive") {
        release();
        throw new Error("No Study recording is active.");
      }
      let contentType: SupportedContentType;
      try {
        contentType = recordingContentType(current);
      } catch (error) {
        release();
        throw error;
      }
      return await new Promise((resolve, reject) => {
        current.addEventListener("error", () => {
          release();
          reject(new Error("The browser could not finish the Study recording."));
        }, { once: true });
        current.addEventListener("stop", () => {
          const elapsedMs = Math.round(performance.now() - startedAt);
          const audio = new Blob(chunks, { type: contentType });
          release();
          if (elapsedMs > 60_000 || audio.size === 0 || audio.size > 524_288) {
            reject(new Error("The Study recording is empty or too large. Record a shorter answer."));
            return;
          }
          const durationMs = Math.max(1, elapsedMs);
          resolve({ audio, contentType, durationMs });
        }, { once: true });
        current.stop();
      });
    },
  };
}
