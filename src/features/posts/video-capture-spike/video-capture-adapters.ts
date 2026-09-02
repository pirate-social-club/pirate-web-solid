import {
  BufferTarget,
  canEncodeAudio,
  canEncodeVideo,
  MediaStreamAudioTrackSource,
  MediaStreamVideoTrackSource,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";

import { inspectFinalizedVideo, type VideoCaptureInspection } from "./video-capture-inspector";
import {
  deriveLocalCopyPathHint,
  selectConstrainedBaselineProfile,
  type ConstrainedBaselineCaptureProfile,
  type LocalCopyPathHint,
} from "./video-capture-model";

export type CaptureResult = {
  blob: Blob;
  recorderMimeType: string;
  finalizationMs: number;
  videoEncoderConfig: VideoEncoderConfig | null;
  requestedVideoProfile: ConstrainedBaselineCaptureProfile | null;
  profileEvidence: null | {
    authority: "advisory_evidence_only";
    exactRequestedProfile: boolean;
    requestedCodecString: string;
    observedCodecString: string | null;
    observedLevel: string | null;
    observedConstrainedBaseline: boolean | null;
  };
  videoTrackSettings: MediaTrackSettings;
  audioTrackSettings: MediaTrackSettings | null;
  audioEncoder: "none" | "native-aac" | "polyfilled-aac" | "mediarecorder-opus";
  inspection: VideoCaptureInspection;
  localCopyPathHint: LocalCopyPathHint;
};

export type CaptureSession = {
  stop(): Promise<CaptureResult>;
  cancel(): Promise<void>;
};

export type PreferredCapability = {
  secureContext: boolean;
  cameraApi: boolean;
  webCodecs: boolean;
  avcEncode: boolean;
  profileMatrix: readonly {
    profile: ConstrainedBaselineCaptureProfile;
    supported: boolean;
  }[];
  nativeAacEncode: boolean;
  note: string;
};

const VIDEO_QUALITY = new Quality({ bitrate: 4_000_000 });
const AUDIO_QUALITY = new Quality({ bitrate: 128_000 });

export async function probePreferredCapability(): Promise<PreferredCapability> {
  const webCodecs = "VideoEncoder" in globalThis;
  const profileMatrix = await Promise.all([
    selectConstrainedBaselineProfile(640, 480, 30),
    selectConstrainedBaselineProfile(720, 1280, 30),
    selectConstrainedBaselineProfile(1080, 1920, 30),
  ].map(async (profile) => ({
    profile,
    supported: await canEncodeVideo("avc", {
      width: profile.width,
      height: profile.height,
      quality: VIDEO_QUALITY,
      fullCodecString: profile.fullCodecString,
      hardwareAcceleration: "prefer-hardware",
      latencyMode: "realtime",
    }),
  })));
  const avcEncode = profileMatrix.find((entry) => entry.profile.width === 720)?.supported ?? false;
  const nativeAacEncode = "AudioEncoder" in globalThis && await canEncodeAudio("aac", {
    numberOfChannels: 1,
    sampleRate: 48_000,
    quality: AUDIO_QUALITY,
  });
  return {
    secureContext: globalThis.isSecureContext,
    cameraApi: Boolean(globalThis.navigator?.mediaDevices?.getUserMedia),
    webCodecs,
    avcEncode,
    profileMatrix,
    nativeAacEncode,
    note: "The exact profile, prefer-hardware, realtime latency, and one-second keyframe interval are requests; only finalized-file inspection is evidence.",
  };
}

export async function startMediabunnyCapture(
  stream: MediaStream,
  options: { includeAudio: boolean; allowAacPolyfill: boolean },
): Promise<CaptureSession> {
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) throw new Error("A camera video track is required.");
  const audioTrack = options.includeAudio ? stream.getAudioTracks()[0] : undefined;
  if (options.includeAudio && !audioTrack) throw new Error("Microphone capture was requested but no audio track exists.");
  const videoTrackSettings = videoTrack.getSettings();
  const audioTrackSettings = audioTrack?.getSettings() ?? null;
  const audioChannels = audioTrackSettings?.channelCount ?? 1;
  const audioSampleRate = audioTrackSettings?.sampleRate ?? 48_000;
  const requestedVideoProfile = selectConstrainedBaselineProfile(
    videoTrackSettings.width ?? 720,
    videoTrackSettings.height ?? 1280,
    videoTrackSettings.frameRate ?? 30,
  );
  if (!await canEncodeVideo("avc", {
    width: requestedVideoProfile.width,
    height: requestedVideoProfile.height,
    quality: VIDEO_QUALITY,
    fullCodecString: requestedVideoProfile.fullCodecString,
    hardwareAcceleration: "prefer-hardware",
    latencyMode: "realtime",
  })) {
    throw new Error("The camera track cannot be encoded with the preferred AVC profile.");
  }

  let audioEncoder: CaptureResult["audioEncoder"] = "none";
  if (audioTrack) {
    if (await canEncodeAudio("aac", {
      numberOfChannels: audioChannels,
      sampleRate: audioSampleRate,
      quality: AUDIO_QUALITY,
    })) {
      audioEncoder = "native-aac";
    } else if (options.allowAacPolyfill) {
      const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
      registerAacEncoder();
      if (!await canEncodeAudio("aac", {
        numberOfChannels: audioChannels,
        sampleRate: audioSampleRate,
        quality: AUDIO_QUALITY,
      })) {
        throw new Error("The AAC polyfill registered but could not satisfy the capture profile.");
      }
      audioEncoder = "polyfilled-aac";
    } else {
      throw new Error("Native AAC encoding is unavailable and this device is not allowed to use the polyfill.");
    }
  }

  const target = new BufferTarget();
  const output = new Output({
    target,
    format: new Mp4OutputFormat({ fastStart: "fragmented", minimumFragmentDuration: 1 }),
  });
  let videoEncoderConfig: VideoEncoderConfig | null = null;
  // Harness-only: production must surface a typed encoder failure immediately
  // instead of deferring this out-of-band error until the author presses Stop.
  let sourceError: Error | undefined;
  const videoSource = new MediaStreamVideoTrackSource(videoTrack, {
    codec: "avc",
    quality: VIDEO_QUALITY,
    fullCodecString: requestedVideoProfile.fullCodecString,
    keyFrameInterval: 1,
    hardwareAcceleration: "prefer-hardware",
    latencyMode: "realtime",
    onEncoderConfig: (config) => {
      videoEncoderConfig = { ...config };
    },
  });
  void videoSource.errorPromise.catch((error: Error) => {
    sourceError = error;
  });
  output.addVideoTrack(videoSource);

  if (audioTrack) {
    const audioSource = new MediaStreamAudioTrackSource(audioTrack, {
      codec: "aac",
      quality: AUDIO_QUALITY,
    });
    void audioSource.errorPromise.catch((error: Error) => {
      sourceError = error;
    });
    output.addAudioTrack(audioSource);
  }
  await output.start();

  let ended = false;
  const release = () => stream.getTracks().forEach((track) => track.stop());
  return {
    async stop() {
      if (ended) throw new Error("The capture session has already ended.");
      ended = true;
      const finalizeStartedAt = performance.now();
      try {
        await output.finalize();
        if (sourceError) throw sourceError;
        if (!target.buffer) throw new Error("Mediabunny finalized without an output buffer.");
        const recorderMimeType = await output.getMimeType();
        const blob = new Blob([target.buffer], { type: recorderMimeType });
        const inspection = await inspectFinalizedVideo(blob);
        const exactRequestedProfile = inspection.video.codecParameter?.toLowerCase()
          === requestedVideoProfile.fullCodecString;
        return {
          blob,
          recorderMimeType,
          finalizationMs: Math.round(performance.now() - finalizeStartedAt),
          videoEncoderConfig,
          requestedVideoProfile,
          profileEvidence: {
            authority: "advisory_evidence_only",
            exactRequestedProfile,
            requestedCodecString: requestedVideoProfile.fullCodecString,
            observedCodecString: inspection.video.codecParameter,
            observedLevel: inspection.video.avcProfile?.level ?? null,
            observedConstrainedBaseline: inspection.video.avcProfile?.constrainedBaseline ?? null,
          },
          videoTrackSettings,
          audioTrackSettings,
          audioEncoder,
          inspection,
          localCopyPathHint: deriveLocalCopyPathHint(
            inspection.video.codec,
            inspection.reordering,
          ),
        };
      } finally {
        release();
      }
    },
    async cancel() {
      if (ended) return;
      ended = true;
      try {
        await output.cancel();
      } finally {
        release();
      }
    },
  };
}

const WEBM_AUDIO_CANDIDATES = [
  'video/webm;codecs="vp9,opus"',
  'video/webm;codecs="vp8,opus"',
] as const;

const WEBM_VIDEO_CANDIDATES = [
  'video/webm;codecs="vp9"',
  'video/webm;codecs="vp8"',
] as const;

export function selectMediaRecorderWebmMimeType(includeAudio = true): string | null {
  if (!("MediaRecorder" in globalThis)) return null;
  const candidates = includeAudio ? WEBM_AUDIO_CANDIDATES : WEBM_VIDEO_CANDIDATES;
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? null;
}

export function startMediaRecorderFallback(stream: MediaStream): CaptureSession {
  const audioTrackSettings = stream.getAudioTracks()[0]?.getSettings() ?? null;
  const videoTrackSettings = stream.getVideoTracks()[0]?.getSettings();
  if (!videoTrackSettings) throw new Error("A camera video track is required.");
  const requestedMimeType = selectMediaRecorderWebmMimeType(audioTrackSettings !== null);
  if (!requestedMimeType) throw new Error("This browser exposes no approved MediaRecorder WebM fallback.");
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType: requestedMimeType });
  let ended = false;
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  recorder.start(1_000);

  const release = () => stream.getTracks().forEach((track) => track.stop());
  return {
    stop() {
      if (ended) return Promise.reject(new Error("The capture session has already ended."));
      ended = true;
      const finalizeStartedAt = performance.now();
      return new Promise<CaptureResult>((resolve, reject) => {
        recorder.addEventListener("error", () => {
          release();
          reject(new Error("MediaRecorder could not finalize the WebM fallback."));
        }, { once: true });
        recorder.addEventListener("stop", () => {
          void (async () => {
            try {
              const recorderMimeType = recorder.mimeType;
              const blob = new Blob(chunks, { type: recorderMimeType });
              const inspection = await inspectFinalizedVideo(blob);
              resolve({
                blob,
                recorderMimeType,
                finalizationMs: Math.round(performance.now() - finalizeStartedAt),
                videoEncoderConfig: null,
                requestedVideoProfile: null,
                profileEvidence: null,
                videoTrackSettings,
                audioTrackSettings,
                audioEncoder: audioTrackSettings ? "mediarecorder-opus" : "none",
                inspection,
                localCopyPathHint: deriveLocalCopyPathHint(
                  inspection.video.codec,
                  inspection.reordering,
                ),
              });
            } catch (error) {
              reject(error);
            } finally {
              release();
            }
          })();
        }, { once: true });
        recorder.stop();
      });
    },
    async cancel() {
      if (ended) return;
      ended = true;
      if (recorder.state !== "inactive") recorder.stop();
      release();
    },
  };
}
