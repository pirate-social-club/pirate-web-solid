import { afterEach, describe, expect, test, vi } from "vitest";

import { createStudyingBrowserRecorder } from "./studying-browser-recorder";

afterEach(() => {
  vi.unstubAllGlobals();
});

class FakeMediaRecorder extends EventTarget {
  static isTypeSupported(type: string) {
    return type === "audio/webm";
  }

  mimeType = "audio/webm";
  state: RecordingState = "inactive";
  stopped = false;
  private readonly stream: { getTracks: () => { stop: () => void }[] };

  constructor(
    stream: { getTracks: () => { stop: () => void }[] },
    _options?: MediaRecorderOptions,
  ) {
    super();
    this.stream = stream;
  }

  start() {
    this.state = "recording";
  }

  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.stopped = true;
    this.stream.getTracks().forEach((track) => track.stop());
    this.dispatchEvent(new Event("stop"));
  }

  emitChunk(bytes: number) {
    const event = new Event("dataavailable");
    Object.defineProperty(event, "data", { value: { size: bytes } });
    this.dispatchEvent(event);
  }
}

function fakeStream() {
  const stopTrack = vi.fn();
  return { stream: { getTracks: () => [{ stop: stopTrack }] }, stopTrack };
}

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

  test("stopping while permission is pending cancels and releases the late grant", async () => {
    let grantPermission: ((stream: unknown) => void) | undefined;
    const getUserMedia = vi.fn(
      () => new Promise((resolve) => {
        grantPermission = resolve;
      }),
    );
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder as unknown as typeof MediaRecorder);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia },
    });

    const recorder = createStudyingBrowserRecorder();
    const starting = recorder.start();
    await expect(recorder.stop()).rejects.toThrow("No Study recording is active.");

    const { stream, stopTrack } = fakeStream();
    grantPermission?.(stream);
    await expect(starting).rejects.toThrow("Study recording was cancelled.");
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  test("cancel during pending permission stops the late-arriving tracks", async () => {
    let grantPermission: ((stream: unknown) => void) | undefined;
    const getUserMedia = vi.fn(
      () => new Promise((resolve) => {
        grantPermission = resolve;
      }),
    );
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder as unknown as typeof MediaRecorder);
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia },
    });

    const recorder = createStudyingBrowserRecorder();
    const starting = recorder.start();
    await recorder.cancel?.();

    const { stream, stopTrack } = fakeStream();
    grantPermission?.(stream);
    await expect(starting).rejects.toThrow("Study recording was cancelled.");
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  test("cancel stops an active recording and its tracks, and is idempotent", async () => {
    const { stream, stopTrack } = fakeStream();
    const instances: FakeMediaRecorder[] = [];
    vi.stubGlobal(
      "MediaRecorder",
      class extends FakeMediaRecorder {
        constructor(
          acquired: { getTracks: () => { stop: () => void }[] },
          options?: MediaRecorderOptions,
        ) {
          super(acquired, options);
          instances.push(this);
        }
      } as unknown as typeof MediaRecorder,
    );
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const recorder = createStudyingBrowserRecorder();
    await recorder.start();
    await recorder.cancel?.();
    await recorder.cancel?.();

    expect(instances[0]?.state).toBe("inactive");
    expect(instances[0]?.stopped).toBe(true);
    expect(stopTrack).toHaveBeenCalled();
    await expect(recorder.stop()).rejects.toThrow("No Study recording is active.");
  });

  test("rejects an oversize capture at the byte ceiling while recording", async () => {
    const { stream, stopTrack } = fakeStream();
    const instances: FakeMediaRecorder[] = [];
    vi.stubGlobal(
      "MediaRecorder",
      class extends FakeMediaRecorder {
        constructor(
          acquired: { getTracks: () => { stop: () => void }[] },
          options?: MediaRecorderOptions,
        ) {
          super(acquired, options);
          instances.push(this);
        }
      } as unknown as typeof MediaRecorder,
    );
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const recorder = createStudyingBrowserRecorder();
    await recorder.start();

    instances[0]?.emitChunk(600_000);
    expect(instances[0]?.state).toBe("inactive");
    expect(stopTrack).toHaveBeenCalled();
    await expect(recorder.stop()).rejects.toThrow("empty or too large");
  });
});
