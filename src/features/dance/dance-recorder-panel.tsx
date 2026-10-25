import { createSignal, onCleanup, onSettled, Show, untrack } from "solid-js";
import { Button, buttonVariants, IconArrowLeft, IconButton, Type } from "../../design-system";
import type { DanceJournalScope, DanceJournalStore } from "./dance-preparation-journal";
import { createBrowserDanceJournalStore } from "./dance-preparation-journal";
import type { createDancePreparationApi } from "./dance-preparation-api";
import { createDanceRecorder, type DanceRecorderStage, type DanceRecorderView } from "./dance-recorder";
import { danceReviewPath } from "./dance-review-api";
import { danceResultPath } from "./dance-result-api";
import { VideoCaptureError } from "../posts/video-submission/capture-failure";
import { DanceFundedObjectives } from "./dance-funded-objectives";

export function DanceRecorderPanel(props: {
  readonly scope: DanceJournalScope;
  readonly policyHash: string;
  readonly profileLabel: string;
  readonly api: ReturnType<typeof createDancePreparationApi>;
  readonly onBack: () => void;
  readonly store?: DanceJournalStore;
  readonly recorder?: typeof createDanceRecorder;
}) {
  const options = untrack(() => ({ ...props, scope: { ...props.scope } }));
  const [view, setView] = createSignal<DanceRecorderView | null>(null, { ownedWrite: true });
  const [phase, setPhase] = createSignal<"loading" | "ready" | "error" | DanceRecorderStage>("loading", { ownedWrite: true });
  const [elapsed, setElapsed] = createSignal(0, { ownedWrite: true });
  const [errorKind, setErrorKind] = createSignal<"step" | "camera" | "unsupported" | "unavailable">("step", { ownedWrite: true });
  let alive = true, generation = 0, request = new AbortController(), recorder: ReturnType<typeof createDanceRecorder> | undefined;
  let video: HTMLVideoElement | undefined;
  const current = () => alive && !request.signal.aborted;
  const clearPreview = () => { if (video) { video.pause(); video.srcObject = null; } };
  const failed = (error: Error) => {
    clearPreview();
    setErrorKind(error instanceof VideoCaptureError && error.reason === "camera_denied" ? "camera"
      : error instanceof VideoCaptureError && error.reason === "capability_unavailable" ? "unsupported"
      : error.message === "dance_recorder_funded_unavailable" ? "unavailable" : "step");
    setPhase("error");
  };
  const create = () => {
    const scope = options.scope;
    return (options.recorder ?? createDanceRecorder)({ scope, currentScope: () => current() ? scope : null,
      store: options.store ?? createBrowserDanceJournalStore(), preparationApi: options.api });
  };
  const apply = async (next: DanceRecorderView, owns: () => boolean) => {
    if (!owns()) return;
    if (next.kind === "objectives" && (next.context.reward_mode === "practice" || next.consentRequested)) {
      // Practice needs no additional acceptance. Funded objectives remain on
      // screen until the participant explicitly enters that captured session.
      // A saved consent intent only replays that same request after uncertainty.
      next = await recorder!.enter(next.session.terms_hash, request.signal); if (!owns()) return;
    }
    setView(next); setPhase("ready");
  };
  const acceptObjectives = async () => {
    const selectedView = view();
    if (phase() !== "ready" || selectedView?.kind !== "objectives" || selectedView.context.reward_mode !== "reward_eligible" || !recorder) return;
    const selected = ++generation, pending = request;
    const owns = () => alive && generation === selected && !pending.signal.aborted;
    setPhase("loading");
    try { await apply(await recorder.enter(selectedView.session.terms_hash, pending.signal), owns); }
    catch (error) { if (owns()) failed(error instanceof Error ? error : new Error("dance_recorder_failed")); }
  };
  const load = async (recover = false, freshAttempt = false) => {
    if (!alive) return;
    if (request.signal.aborted) { request = new AbortController(); recorder = undefined; }
    const selected = ++generation, pending = request;
    const owns = () => alive && generation === selected && !pending.signal.aborted;
    setPhase("loading"); clearPreview();
    try {
      recorder ??= create();
      const next = freshAttempt ? await recorder.newAttempt(options.policyHash, pending.signal)
        : recover ? await recorder.recover(options.policyHash, pending.signal, stage => { if (owns()) setPhase(stage); })
        : await recorder.prepare(options.policyHash, pending.signal);
      await apply(next, owns);
    } catch (error) { if (owns()) failed(error instanceof Error ? error : new Error("dance_recorder_failed")); }
  };
  const record = async () => {
    if (phase() !== "ready" || view()?.kind !== "camera" || !recorder) return;
    const selected = ++generation, pending = request;
    const owns = () => alive && generation === selected && !pending.signal.aborted;
    try {
      const next = await recorder.record(pending.signal, stage => { if (owns()) setPhase(stage); }, time => { if (owns()) setElapsed(time); });
      if (!owns()) return; clearPreview(); await apply(next, owns);
    } catch (error) { if (owns()) failed(error instanceof Error ? error : new Error("dance_recorder_failed")); }
  };
  const resume = async () => {
    const value = session(); if (!value || !recorder || phase() !== "ready") return;
    const selected = ++generation, pending = request;
    const owns = () => alive && generation === selected && !pending.signal.aborted;
    setPhase("uploading");
    try { await apply(await recorder.resume(value.session_id, pending.signal), owns); }
    catch (error) { if (owns()) failed(error instanceof Error ? error : new Error("dance_recorder_failed")); }
  };
  const interrupt = () => {
    if (document.visibilityState !== "hidden") return;
    generation++; request.abort(); recorder?.dispose(); recorder = undefined; clearPreview(); setView(null); setErrorKind("step"); setPhase("error");
  };
  onSettled(() => { void load(); document.addEventListener("visibilitychange", interrupt); });
  onCleanup(() => { alive = false; generation++; request.abort(); recorder?.dispose(); clearPreview(); document.removeEventListener("visibilitychange", interrupt); });
  const camera = () => { const current = view(); return current?.kind === "camera" && phase() !== "error" ? current : undefined; };
  const session = () => { const current = view(); return current?.kind === "camera" ? current.ready.session : current?.kind === "upload" ? current.upload.session : current?.session; };
  const uploaded = () => { const value = view(); return phase() === "ready" && value?.kind === "upload" ? value.upload : undefined; };
  const objectives = () => { const value = view(); return phase() === "ready" && value?.kind === "objectives" && value.context.reward_mode === "reward_eligible" ? value.context : undefined; };
  const cue = () => {
    const value = camera(); if (!value) return "";
    if (phase() === "recording" && elapsed() >= value.ready.session.body_start_ms) return "Follow the dance";
    const cues = { hands_on_head: "Hands on your head", arms_t: "Hold your arms out to the sides", hands_on_hips: "Hands on your hips" };
    return cues[value.ready.session.cue.kind];
  };
  const errorMessage = () => ({ step: "We couldn’t finish this step. Check your recording to continue.", camera: "Camera or microphone access is off. Allow access in your browser, then check again.", unsupported: "This browser can’t record this dance. Try another browser.", unavailable: "Recording isn’t available for this dance right now." })[errorKind()];
  const status = () => ({ loading: "Preparing your recording…", preparing_audio: "Preparing the song…", recording: "Recording", saving: "Saving your recording…", uploading: "Uploading your recording…", ready: "", error: errorMessage() })[phase()];
  return <section class="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-background text-foreground" data-dance-recorder={phase()}>
    <header class="flex min-h-16 items-center gap-3 px-4"><IconButton aria-label="Back to dance" variant="ghost" onClick={options.onBack}><IconArrowLeft /></IconButton><Type as="h1" variant="h3">Dance</Type><span class="ml-auto truncate text-sm">{options.profileLabel}</span></header>
    <Show when={camera()} keyed fallback={<div class="mx-auto flex w-full max-w-md flex-col gap-5 p-5">
      <Show when={status()}><p aria-live="polite" aria-busy={phase() !== "error" && phase() !== "ready" ? "true" : "false"}>{status()}</p></Show>
      <Show when={phase() === "error"}><Button onClick={() => void load(true)}>Check recording</Button></Show>
      <Show when={objectives()} keyed>{context => <DanceFundedObjectives context={context} onAccept={() => void acceptObjectives()} />}</Show>
      <Show when={phase() === "ready" && view()?.kind === "recovery"}><p>Your saved recording is ready to upload.</p><Button onClick={() => void resume()}>Resume upload</Button></Show>
      <Show when={phase() === "ready" && view()?.kind === "upload_recovery"}><p>Your recording has an unfinished upload.</p><Button onClick={() => void resume()}>Check upload</Button></Show>
      <Show when={phase() === "ready" && view()?.kind === "expired"}><p>This recording session expired.</p></Show>
      <Show when={phase() === "ready" && view()?.kind === "terminal"}><p>This recording has finished.</p><Button onClick={() => void load(false, true)}>Record again</Button></Show>
      <Show when={uploaded()} keyed>{value => {
        const messages = { missing_recording: "The original recording isn’t on this device.", original_command_missing: "The original upload details aren’t on this device.", processing: "Your recording is being prepared.", reconciling: "Your upload is being checked.", unavailable: "This recording is unavailable.", expired: "This recording session expired.", review: "Your recording is ready.", terminal: "This recording has finished." };
        return <><p role="status">{messages[value.kind]}</p>
          <Show when={value.kind === "processing" || value.kind === "reconciling"}><Button onClick={() => void load(true)}>Check recording</Button></Show>
          <Show when={value.kind === "review"}><a class={buttonVariants({})} href={danceReviewPath(options.scope.communityId, value.session.review_id)}>Review recording</a></Show>
          <Show when={value.kind === "terminal"}><a class={buttonVariants({ variant: "secondary" })} href={danceResultPath(options.scope.communityId, value.session.review_id)}>View result</a></Show>
        </>;
      }}</Show>
    </div>}>
      {value => <div class="relative mx-auto aspect-[9/16] w-full max-w-[calc((100dvh-4rem)*9/16)] flex-none bg-black text-white">
        <video ref={element => { video = element; element.srcObject = value.stream; void element.play().catch(() => {}); }} class="absolute inset-0 h-full w-full object-cover" muted autoplay playsinline aria-label="Camera preview" />
        <div class="relative z-10 flex h-full min-h-[70dvh] flex-col items-center justify-between gap-5 px-5 py-7">
          <a class="rounded-full bg-black/70 px-4 py-2 text-sm underline" href={`/post/${encodeURIComponent(options.scope.postId)}`}>Back to song</a>
          <p class="rounded-xl bg-black/70 p-4 text-center text-lg" aria-live="polite">{phase() === "ready" || phase() === "recording" ? cue() : status()}</p>
          <Show when={phase() === "recording"}><p role="timer" class="rounded-full bg-black/70 px-4 py-2">{(elapsed() / 1000).toFixed(1)} s / {(value.ready.session.body_end_ms / 1000).toFixed(1)} s</p></Show>
          <button type="button" aria-label={phase() === "ready" ? "Record" : "Recording in progress"} disabled={phase() !== "ready"}
            class="grid size-[74px] cursor-pointer place-items-center rounded-full border-4 border-white outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-black disabled:cursor-default disabled:opacity-60"
            onClick={() => void record()}><span class="size-[58px] rounded-full bg-[#f0453a]" /></button>
        </div>
      </div>}
    </Show>
  </section>;
}
