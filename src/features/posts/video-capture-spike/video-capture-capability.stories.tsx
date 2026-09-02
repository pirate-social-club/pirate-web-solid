import { createSignal, Show } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import {
  probePreferredCapability,
  startMediabunnyCapture,
  startMediaRecorderFallback,
  type CaptureResult,
  type CaptureSession,
} from "./video-capture-adapters";
import { deriveCopyPreview, snapStartToKeyframeUs } from "./video-capture-model";

function CaptureCapabilityHarness() {
  const [status, setStatus] = createSignal("Idle");
  const [result, setResult] = createSignal<string>();
  const [session, setSession] = createSignal<CaptureSession>();
  const [previewUrl, setPreviewUrl] = createSignal<string>();
  const [includeAudio, setIncludeAudio] = createSignal(true);
  const [allowPolyfill, setAllowPolyfill] = createSignal(false);

  const showError = (error: Error) => {
    setStatus(error.message);
  };
  const finish = async (capture: CaptureResult) => {
    const previousUrl = previewUrl();
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    setPreviewUrl(URL.createObjectURL(capture.blob));
    const packets = capture.inspection.packets;
    const requestedStartUs = Math.min(1_100_000, Math.max(0, capture.inspection.durationUs - 500_000));
    const sourceStartUs = snapStartToKeyframeUs(packets, requestedStartUs);
    const availableUs = capture.inspection.durationUs - sourceStartUs;
    const copyPreview = deriveCopyPreview(packets, sourceStartUs, Math.max(1, availableUs));
    setResult(JSON.stringify({
      userAgent: navigator.userAgent,
      trackSettings: "Captured at start; inspect browser developer output for device-specific labels.",
      recorderMimeType: capture.recorderMimeType,
      finalBlobType: capture.blob.type,
      exactFinalByteLength: capture.blob.size,
      finalizationMs: capture.finalizationMs,
      videoEncoderConfig: capture.videoEncoderConfig,
      videoTrackSettings: capture.videoTrackSettings,
      audioTrackSettings: capture.audioTrackSettings,
      audioEncoder: capture.audioEncoder,
      inspection: capture.inspection,
      copyPreview,
    }, null, 2));
    setStatus("Finalized locally; nothing was uploaded.");
  };

  const start = async (kind: "mediabunny" | "mediarecorder") => {
    setResult(undefined);
    setStatus("Requesting camera permission…");
    try {
      const withAudio = includeAudio();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: { ideal: 30 } },
        audio: withAudio,
      });
      const active = kind === "mediabunny"
        ? await startMediabunnyCapture(stream, {
            includeAudio: withAudio,
            allowAacPolyfill: allowPolyfill(),
          })
        : startMediaRecorderFallback(stream);
      setSession(active);
      setStatus(`Recording through ${kind}; use only synthetic, rights-safe material.`);
    } catch (error) {
      showError(error instanceof Error ? error : new Error("Unknown capture error"));
    }
  };

  return (
    <main class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6 text-foreground">
      <h1 class="text-xl font-semibold">Video capture capability spike</h1>
      <p class="text-sm text-muted-foreground">
        Credential-free and local-only. This does not publish, upload, call a provider, or wire the production composer.
      </p>
      <p class="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
        Acceptance still requires workspace-owner hands on physical current-supported iOS Safari and Android Chrome.
        Desktop or emulated results are not mobile evidence.
      </p>
      <div class="flex flex-wrap gap-3">
        <button class="rounded-md border px-3 py-2" type="button" onClick={() => void probePreferredCapability().then((facts) => setResult(JSON.stringify(facts, null, 2)), showError)}>
          Probe capability
        </button>
        <button class="rounded-md border px-3 py-2" type="button" disabled={Boolean(session())} onClick={() => void start("mediabunny")}>
          Record fMP4 target
        </button>
        <button class="rounded-md border px-3 py-2" type="button" disabled={Boolean(session())} onClick={() => void start("mediarecorder")}>
          Record WebM fallback
        </button>
        <button class="rounded-md border px-3 py-2" type="button" disabled={!session()} onClick={() => {
          const active = session();
          setSession(undefined);
          if (active) void active.stop().then(finish, showError);
        }}>
          Stop and inspect
        </button>
      </div>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={includeAudio()} onChange={(event) => setIncludeAudio(event.currentTarget.checked)} /> Include microphone
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={allowPolyfill()} onChange={(event) => setAllowPolyfill(event.currentTarget.checked)} /> Allow spike-only AAC polyfill
      </label>
      <output class="text-sm" aria-live="polite">{status()}</output>
      <Show when={previewUrl()}>{(url) => <video class="max-h-96 rounded-md" src={url()} controls playsinline />}</Show>
      <Show when={result()}>{(facts) => <pre class="max-h-[32rem] overflow-auto rounded-md bg-muted p-3 text-xs">{facts()}</pre>}</Show>
    </main>
  );
}

const meta = {
  title: "Internal/Video Capture Capability Spike",
  parameters: { layout: "fullscreen" },
  render: () => <CaptureCapabilityHarness />,
} satisfies Meta;

export default meta;
export const LocalOnlyHarness: StoryObj = {};
