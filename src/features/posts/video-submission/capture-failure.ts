export type VideoCaptureFailure = "capability_unavailable" | "camera_denied" | "orientation_lost" | "encoder_failed" | "invalid_media";
export class VideoCaptureError extends Error {
  constructor(readonly reason: VideoCaptureFailure, message: string) { super(message); this.name = "VideoCaptureError"; }
}

/** Source error promises are independent of Stop and must end recording now. */
export function createCaptureFailureBoundary(input: {
  readonly ended: () => boolean;
  readonly markEnded: () => void;
  readonly dimensionsChanged: () => boolean;
  readonly release: () => void;
  readonly cancel: () => Promise<void>;
  readonly onFailure: (error: VideoCaptureError) => void;
}) {
  let sourceError: VideoCaptureError | null = null;
  function fail(reason: VideoCaptureFailure, message: string) {
    if (input.ended()) return;
    input.markEnded(); input.release();
    input.onFailure(new VideoCaptureError(reason, message));
    void input.cancel().catch(() => {});
  }
  function sourceFailed() {
    const changed = input.dimensionsChanged();
    sourceError = new VideoCaptureError(changed ? "orientation_lost" : "encoder_failed",
      changed ? "Capture dimensions changed. Retake in one orientation." : "Video encoding failed. Retake or choose a compatible file.");
    fail(sourceError.reason, sourceError.message);
  }
  return {
    fail,
    observe(source: Promise<void>) { void source.catch(sourceFailed); },
    assertFinalized() { if (sourceError) throw sourceError; },
  };
}
