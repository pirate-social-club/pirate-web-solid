import { isServer } from "@solidjs/web";
import { createSignal, onCleanup, onSettled, Show, untrack } from "solid-js";
import type { SnapshotFrom } from "xstate";
import { Button, MobilePageHeader, Spinner } from "../../design-system";
import type { DanceJournalScope, DanceJournalStore } from "./dance-preparation-journal";
import { createBrowserDanceJournalStore } from "./dance-preparation-journal";
import type { createDancePreparationApi } from "./dance-preparation-api";
import { createDanceRecorder } from "./dance-recorder";
import { createDanceJourneyActor, type DanceJourneyActor, type createDanceRecorderMachine } from "./dance-recorder-machine";
import { OriginalVideoCaptureSurface } from "../posts/post-composer/video-original-audio-surface";
import { VideoCaptureError } from "../posts/video-submission/capture-failure";
import { DanceFundedObjectives } from "./dance-funded-objectives";
import { DanceReviewPage } from "./dance-review-page";
import type { DanceReviewApi } from "./dance-review-api";
import type { SessionResolution } from "../../api/session";

export function DanceRecorderPanel(props: {
  readonly scope: DanceJournalScope;
  readonly policyHash: string;
  readonly profileLabel: string;
  readonly api: ReturnType<typeof createDancePreparationApi>;
  readonly onBack: () => void;
  readonly store?: DanceJournalStore;
  readonly recorder?: typeof createDanceRecorder;
  readonly reviewApi?: DanceReviewApi;
  readonly session?: () => Promise<SessionResolution>;
}) {
  const options = untrack(() => ({ ...props, scope: { ...props.scope } }));
  const store = options.store ?? createBrowserDanceJournalStore();
  const [state, setState] = createSignal<SnapshotFrom<ReturnType<typeof createDanceRecorderMachine>> | null>(null, { ownedWrite: true });
  const [preview, setPreview] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  let alive = true, recorder: ReturnType<typeof createDanceRecorder> | undefined, journey: DanceJourneyActor | undefined;
  let localVideo: HTMLVideoElement | undefined;
  let video: HTMLVideoElement | undefined, previewTimer: ReturnType<typeof setTimeout> | undefined;
  const clearCamera = () => { if (video) { video.pause(); video.srcObject = null; } };
  const clearPreview = () => { if (localVideo) { localVideo.pause(); localVideo.removeAttribute("src"); localVideo.load(); } clearTimeout(previewTimer); const url = preview(); if (url) URL.revokeObjectURL(url); setPreview(undefined); };
  const showPreview = (blob: Blob, expiresAtMs: number) => {
    if (!alive || document.visibilityState === "hidden" || expiresAtMs <= Date.now()) return;
    clearCamera();
    clearPreview(); setPreview(URL.createObjectURL(blob)); previewTimer = setTimeout(clearPreview, expiresAtMs - Date.now());
  };
  const visibility = () => {
    if (document.visibilityState === "hidden") journey?.send({ type: "BACKGROUND" });
    else journey?.send({ type: "FOREGROUND" });
  };
  const online = () => journey?.send({ type: "FOREGROUND" });
  onSettled(() => {
    recorder = (options.recorder ?? createDanceRecorder)({ scope: options.scope, currentScope: () => alive ? options.scope : null,
      store, preparationApi: options.api });
    journey = createDanceJourneyActor({ recorder, policyHash: options.policyHash, preview: showPreview,
      pause: () => { recorder?.pause(); clearCamera(); clearPreview(); } });
    journey.subscribe(snapshot => { if (alive) setState(snapshot); }); journey.start();
    document.addEventListener("visibilitychange", visibility); window.addEventListener("online", online);
  });
  onCleanup(() => {
    alive = false; journey?.stop(); recorder?.dispose(); clearCamera(); clearPreview();
    if (!isServer) { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("online", online); }
  });
  const matches = (value: string) => state()?.value === value;
  const view = () => state()?.context.view;
  const camera = () => { const value = view(); return value?.kind === "camera" && (matches("camera") || (matches("capturing") && ["preparing_audio", "recording"].includes(state()!.context.stage))) ? value : undefined; };
  const session = () => { const value = view(); return value?.kind === "camera" ? value.ready.session : value?.kind === "upload" ? value.upload.session : value?.session; };
  const review = () => state()?.matches("review") ? session() : undefined;
  const objectives = () => { const value = view(); return matches("objectives") && value?.kind === "objectives" ? value.context : undefined; };
  // Retained pose policies still require their captured instruction. The
  // prospective no-pose policy must remove that obligation truthfully.
  const capturedCue = () => {
    const value = camera(); if (!value || !matches("camera")) return undefined;
    return { hands_on_head: "Hands on your head", arms_t: "Hold your arms out to the sides", hands_on_hips: "Hands on your hips" }[value.ready.session.cue.kind];
  };
  const processing = () => state()?.matches("processing") ?? false;
  const finished = () => { const value = view(); return value?.kind === "expired" || value?.kind === "terminal" || (value?.kind === "upload" && value.upload.kind === "expired"); };
  const missingOriginal = () => { const value = view(); return value?.kind === "upload" && ["missing_recording", "original_command_missing", "unavailable"].includes(value.upload.kind); };
  const errorMessage = () => {
    const value = view();
    if (value?.kind === "upload") {
      if (value.upload.kind === "missing_recording") return "The original recording isn’t on this device.";
      if (value.upload.kind === "original_command_missing") return "The original upload details aren’t on this device. No new upload has been started.";
      if (value.upload.kind === "unavailable") return "This recording is unavailable.";
    }
    const error = state()?.context.error;
    if (error instanceof VideoCaptureError && error.reason === "camera_denied") return "Camera or microphone access is off. Allow access in your browser, then retry.";
    if (error instanceof VideoCaptureError && error.reason === "capability_unavailable") return "This browser can’t record this dance. Try another browser.";
    if (error instanceof Error && error.message === "dance_recorder_funded_unavailable") return "Recording isn’t available for this dance right now.";
    return "Your recording was interrupted. Resume to continue with the saved recording, if one exists.";
  };
  const status = () => {
    if (state()?.matches({ processing: "interrupted" })) return "Connection interrupted. We’ll check when you reconnect or return.";
    if (state()?.matches({ processing: "resting" })) return "Your recording is still being prepared. You can leave and return later.";
    if (processing()) return "Your recording is being prepared.";
    if (matches("capturing")) return ({ preparing_audio: "Starting…", recording: "Recording", saving: "Saving your recording…", uploading: "Uploading your recording…" })[state()!.context.stage];
    if (matches("resuming")) return "Resuming your upload…";
    if (matches("recovery")) return errorMessage();
    if (matches("paused")) return "Recording paused while this screen is hidden.";
    return "Preparing your camera and song…";
  };
  return <section role={review() ? undefined : "main"} class="fixed inset-0 z-40 bg-background text-foreground" data-dance-recorder={processing() ? "processing" : state()?.matches("review") ? "review" : state()?.value.toString() ?? "preparing"}>
    <Show when={review()} keyed fallback={<>
      <Show when={!camera()}><h1 class="sr-only">Dance</h1><MobilePageHeader title="Dance" density="compact" onBackClick={options.onBack} backAriaLabel="Back to dance"
        trailingAction={<span class="max-w-24 truncate text-xs text-muted-foreground">{options.profileLabel}</span>} /></Show>
      <Show when={camera()} keyed fallback={<div class="flex h-dvh flex-col gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[calc(4rem+env(safe-area-inset-top))]">
        <Show when={preview()}>{url => <video ref={element => { localVideo = element; onCleanup(() => { element.pause(); element.removeAttribute("src"); element.load(); }); }} class="min-h-0 flex-1 bg-black object-contain" src={url()} controls playsinline aria-label="Your local recording" />}</Show>
        <Show when={objectives()} keyed fallback={<>
          <p role="status" aria-live="polite">{status()}</p>
          <Show when={processing() && !state()?.matches({ processing: "interrupted" }) && !state()?.matches({ processing: "resting" })}><Spinner label="Preparing recording" /></Show>
          <Show when={matches("recovery")}>
            <Show when={view()?.kind === "recovery" || view()?.kind === "upload_recovery"} fallback={
              <Show when={finished()} fallback={<Show when={!missingOriginal()}><Button onClick={() => journey?.send({ type: "RETRY" })}>Resume recording</Button></Show>}>
                <p>This recording session has finished.</p><Button onClick={() => journey?.send({ type: "NEW_ATTEMPT" })}>Record again</Button>
              </Show>
            }><p>Your saved recording is ready to upload.</p><Button onClick={() => journey?.send({ type: "RESUME" })}>Resume upload</Button></Show>
          </Show>
          <Show when={state()?.matches({ processing: "interrupted" })}><Button variant="secondary" onClick={() => journey?.send({ type: "RETRY" })}>Retry connection</Button></Show>
        </>}>{context => <DanceFundedObjectives context={context} onAccept={() => journey?.send({ type: "ACCEPT" })} />}</Show>
      </div>}>
        {value => <OriginalVideoCaptureSurface title="Dance" allowUpload={false} onClose={options.onBack}
          notice={<Show when={capturedCue()}>{cue => <p class="text-center text-sm text-white">This session requires an opening cue: {cue()}.</p>}</Show>}
          status={matches("capturing") && state()?.context.stage === "recording" ? "recording" : "idle"}
          elapsedLabel={matches("capturing") ? `${(state()!.context.elapsed / 1000).toFixed(1)} s` : "0 s"}
          durationLabel={`${value.ready.session.body_end_ms / 1000} s`}
          timerClass="rounded-none bg-transparent px-0 py-0 backdrop-blur-none"
          recordDisabled={!matches("camera")} recordActionLabel={matches("camera") ? "Record" : state()?.context.stage === "preparing_audio" ? "Starting recording" : "Recording in progress"}
          onRecordToggle={() => journey?.send({ type: "RECORD" })}
          preview={<video ref={element => { video = element; element.srcObject = value.stream; void element.play().catch(() => {}); }} class="absolute inset-0 h-full w-full object-cover" muted autoplay playsinline aria-label="Camera preview" />} />}
      </Show>
    </>}>
      {value => <DanceReviewPage communityId={options.scope.communityId} reviewId={value.review_id} api={options.reviewApi} store={store}
        session={options.session} localPreview={preview()} journey={journey} />}
    </Show>
  </section>;
}
