import { afterEach, describe, expect, test, vi } from "vitest";

import { createStudyingBrowserRecorder } from "./studying-browser-recorder";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Study browser recorder", () => {
  test("releases the microphone when the browser returns an unsupported recording type", async () => {
    const stopTrack = vi.fn();
    const stream = {
      getTracks: () => [{ stop: stopTrack }],
    };

    class UnsupportedMediaRecorder extends EventTarget {
      static isTypeSupported() {
        return false;
      }

      mimeType = "audio/aac";
      state: RecordingState = "recording";

      constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {
        super();
      }

      start() {}
      stop() {
        this.state = "inactive";
      }
    }

    vi.stubGlobal("MediaRecorder", UnsupportedMediaRecorder);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const recorder = createStudyingBrowserRecorder();
    await recorder.start();

    await expect(recorder.stop()).rejects.toThrow("supported audio recording format");
    expect(stopTrack).toHaveBeenCalledOnce();
  });
});
