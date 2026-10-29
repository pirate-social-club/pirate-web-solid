import { ApiClientError } from "@pirate/api-client";
import { isServer } from "@solidjs/web";
import { useParams } from "@solidjs/router";
import { createEffect, createSignal, For, onCleanup, Show, untrack } from "solid-js";
import { captureSessionAuthority } from "../../api/browser-session-events";
import { onSessionRefreshed, resolveSession, type SessionResolution } from "../../api/session";
import { Button, buttonVariants, Type } from "../../design-system";
import { bindPrivatePageLifecycle } from "../notifications/private-page-lifecycle";
import { VideoPlayer } from "../posts/video-submission/video-player";
import { createBrowserDanceJournalStore, type DanceJournalStore } from "./dance-preparation-journal";
import type { DanceResultScope } from "./dance-result-api";
import { assertDanceOwnerRecording, createDanceOwnerApi, danceOwnerMediaPath, type DanceOwnerApi, type DanceOwnerQueue, type DanceOwnerRecording, type DanceOwnerScope, type DanceOwnerVerdict } from "./dance-owner-api";
import { danceOwnerPath } from "./dance-owner-path";
import { createDanceOwnerController, type DanceOwnerView } from "./dance-owner-controller";

type State = { readonly phase: "loading" | "anonymous" | "unavailable" | "error" } | { readonly phase: "queue"; readonly page: DanceOwnerQueue } | { readonly phase: "detail"; readonly view: DanceOwnerView };
const formatTime = (time: string) => new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const cueName = (id: string) => ({ hands_on_head: "Hands on your head", arms_t: "Hold your arms out to the sides", hands_on_hips: "Hands on your hips" })[id] ?? id;
const accessLost = (error: Error) => (error instanceof ApiClientError && (error.declaredName === "AuthError" || error.declaredName === "NotFound"))
  || error.message === "dance_owner_account_changed" || error.message === "dance_owner_session_changed";

/** Private owner reads occur only after browser session resolution. Leaving the
 * page destroys preview access; no media URL enters the verdict journal. */
export function DanceOwnerPage(props: { readonly communityId: string; readonly reviewId?: string; readonly api?: DanceOwnerApi; readonly store?: DanceJournalStore; readonly session?: () => Promise<SessionResolution> }) {
  const provided = untrack(() => ({ api: props.api, store: props.store, session: props.session }));
  const [state, setState] = createSignal<State>({ phase: "loading" }, { ownedWrite: true });
  const [preview, setPreview] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  const [previewStatus, setPreviewStatus] = createSignal<"idle" | "loading" | "unavailable">("idle", { ownedWrite: true });
  const [moreBusy, setMoreBusy] = createSignal(false, { ownedWrite: true });
  const [moreError, setMoreError] = createSignal(false, { ownedWrite: true });
  const [expired, setExpired] = createSignal(false, { ownedWrite: true });
  let active = true, generation = 0, previewGeneration = 0, request: AbortController | undefined, mediaRequest: AbortController | undefined;
  let previewTimer: ReturnType<typeof setTimeout> | undefined, deadlineTimer: ReturnType<typeof setTimeout> | undefined, video: HTMLVideoElement | undefined;
  let scope: DanceOwnerScope | null = null, api: DanceOwnerApi | undefined, controller: ReturnType<typeof createDanceOwnerController> | undefined;
  const stopPreview = () => { previewGeneration++; mediaRequest?.abort(); mediaRequest = undefined; clearTimeout(previewTimer); if (video) { video.pause(); video.removeAttribute("src"); video.load(); video = undefined; } setPreview(undefined); setPreviewStatus("idle"); };
  const clear = () => { generation++; request?.abort(); stopPreview(); clearTimeout(deadlineTimer); scope = null; api = undefined; controller = undefined; setMoreBusy(false); setMoreError(false); setExpired(false); setState({ phase: "loading" }); };
  const current = (attempt: number, signal: AbortSignal, community: string, review: string | undefined) => active && !signal.aborted && generation === attempt && props.communityId === community && props.reviewId === review;
  const fail = (error: Error) => setState({ phase: error instanceof ApiClientError && error.declaredName === "AuthError" ? "anonymous" : error instanceof ApiClientError && error.declaredName === "NotFound" ? "unavailable" : "error" });
  const apply = (view: DanceOwnerView) => {
    clearTimeout(deadlineTimer); setExpired(false);
    if (view.kind === "review") {
      const checkDeadline = () => {
        const remaining = Date.parse(view.recording.detail.review.review_deadline) - Date.now();
        if (remaining <= 0) { stopPreview(); setExpired(true); }
        else deadlineTimer = setTimeout(checkDeadline, Math.min(remaining, 2_147_483_647));
      };
      checkDeadline();
    }
    setState({ phase: "detail", view });
  };
  const load = async () => {
    clear(); const attempt = generation, communityId = props.communityId, reviewId = props.reviewId, pending = new AbortController(); request = pending;
    const owns = () => current(attempt, pending.signal, communityId, reviewId);
    try {
      const session = await (provided.session ?? resolveSession)(); if (!owns()) return;
      if (session === "anonymous") { setState({ phase: "anonymous" }); return; }
      const authority = captureSessionAuthority(), reader = provided.api ?? createDanceOwnerApi(); api = reader; scope = { accountId: session.userId, communityId };
      if (reviewId) {
        const selected = { ...scope, reviewId };
        const writer = createDanceOwnerController({ scope: selected, currentScope: () => scope && props.reviewId ? { ...scope, reviewId: props.reviewId } : null, store: provided.store ?? createBrowserDanceJournalStore(), api: reader }); controller = writer;
        const view = await writer.load(pending.signal); if (!owns()) return;
        if (captureSessionAuthority() !== authority) { clear(); return; } apply(view);
      } else {
        const page = await reader.queue(scope, null, pending.signal); if (!owns()) return;
        if (captureSessionAuthority() !== authority) { clear(); return; } setState({ phase: "queue", page });
      }
    } catch (error) { if (owns()) fail(error instanceof Error ? error : new Error("dance_owner_unavailable")); }
  };
  const more = async () => {
    const value = state(), selected = scope, reader = api;
    if (value.phase !== "queue" || !value.page.next_cursor || !selected || !reader || moreBusy()) return;
    const attempt = generation, pending = new AbortController(), authority = captureSessionAuthority(); request = pending; setMoreBusy(true); setMoreError(false);
    try {
      const page = await reader.queue(selected, value.page.next_cursor, pending.signal);
      if (!current(attempt, pending.signal, selected.communityId, undefined)) return;
      if (captureSessionAuthority() !== authority) { clear(); return; }
      if (page.next_cursor === value.page.next_cursor) throw new Error("dance_owner_cursor_unchanged");
      const items = new Map(value.page.items.map(item => [item.review_id, item])); for (const item of page.items) items.set(item.review_id, item);
      setState({ phase: "queue", page: { ...page, items: [...items.values()] } });
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error("dance_owner_unavailable");
      if (current(attempt, pending.signal, selected.communityId, undefined)) {
        // Never keep private rows after an authoritative access rejection.
        if (accessLost(error)) { clear(); fail(error); }
        else setMoreError(true);
      }
    } finally { if (current(attempt, pending.signal, selected.communityId, undefined)) setMoreBusy(false); }
  };
  const decide = async (verdict: DanceOwnerVerdict["verdict"]) => {
    const value = state(), writer = controller;
    if (value.phase !== "detail" || value.view.kind !== "review" || !writer || expired()) return;
    const recording = value.view.recording, community = props.communityId, review = props.reviewId, authority = captureSessionAuthority();
    generation++; request?.abort(); stopPreview(); clearTimeout(deadlineTimer); setState({ phase: "loading" });
    const attempt = generation, pending = new AbortController(); request = pending;
    try {
      const view = await writer.decide(recording, verdict, pending.signal); if (!current(attempt, pending.signal, community, review)) return;
      if (captureSessionAuthority() !== authority) { clear(); return; } apply(view);
    } catch (error) { if (current(attempt, pending.signal, community, review)) fail(error instanceof Error ? error : new Error("dance_owner_unavailable")); }
  };
  const play = async (recording: DanceOwnerRecording) => {
    const selected = scope, reader = api, reviewId = props.reviewId; if (!selected || !reader || !reviewId || expired()) return;
    const target: DanceResultScope = { ...selected, reviewId }; assertDanceOwnerRecording(recording, target);
    stopPreview(); setPreviewStatus("loading"); const previewAttempt = previewGeneration, attempt = generation, authority = captureSessionAuthority(), pending = new AbortController(); mediaRequest = pending;
    const owns = () => current(attempt, pending.signal, target.communityId, target.reviewId) && previewAttempt === previewGeneration;
    try {
      const grant = await reader.media(target, recording, pending.signal); if (!owns()) return;
      if (captureSessionAuthority() !== authority) { clear(); return; }
      const expires = Math.min(grant.expires_at_ms, Date.parse(recording.detail.review.review_deadline), Date.now() + 120_000);
      if (grant.url !== danceOwnerMediaPath(target, grant.lease_id) || !Number.isFinite(expires) || expires <= Date.now()) throw new Error("dance_owner_media_unavailable");
      setPreview(grant.url); setPreviewStatus("idle"); previewTimer = setTimeout(stopPreview, expires - Date.now());
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error("dance_owner_media_unavailable");
      if (owns()) {
        if (accessLost(error)) { clear(); fail(error); }
        else { stopPreview(); setPreviewStatus("unavailable"); }
      }
    }
  };
  createEffect(() => [props.communityId, props.reviewId] as const, () => { clear(); const attempt = generation; if (!isServer) queueMicrotask(() => { if (active && generation === attempt) void load(); }); });
  onCleanup(onSessionRefreshed(() => { void load(); })); onCleanup(bindPrivatePageLifecycle(clear)); onCleanup(() => { active = false; clear(); });
  const queue = () => { const v = state(); return v.phase === "queue" ? v.page : undefined; };
  const detail = () => { const v = state(); return v.phase === "detail" ? v.view : undefined; };
  return <main class="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-8" data-dance-owner={state().phase}>
    <Type as="h1" variant="h1">Dance reviews</Type>
    <Show when={state().phase === "loading"}><p aria-busy="true">Checking review access…</p></Show>
    <Show when={state().phase === "anonymous"}><p>Sign in to review recordings.</p><a class={buttonVariants({ variant: "secondary" })} href={`/auth/sign-in?return_to=${encodeURIComponent(danceOwnerPath(props.communityId, props.reviewId))}`}>Sign in</a></Show>
    <Show when={state().phase === "unavailable"}><p>This review isn’t available to you.</p></Show>
    <Show when={state().phase === "error"}><p role="alert">We couldn’t confirm the review status.</p><Button onClick={() => void load()}>Check again</Button></Show>
    <Show when={queue()} keyed>{page => <>
      <Show when={page.items.length === 0}><p>No recordings are waiting for review.</p></Show>
      <ol class="flex flex-col gap-3"><For each={page.items}>{item => <li class="rounded-xl border border-border p-4"><a class="underline" href={danceOwnerPath(props.communityId, item.review_id)}>Review recording</a><p class="text-sm text-muted-foreground">Review before <time datetime={item.review_deadline}>{formatTime(item.review_deadline)}</time></p></li>}</For></ol>
      <Show when={page.next_cursor}><Button variant="secondary" disabled={moreBusy()} onClick={() => void more()}>{moreBusy() ? "Loading…" : "More recordings"}</Button></Show>
      <Show when={moreError()}><p role="alert">More recordings couldn’t be loaded. Try again.</p></Show>
    </>}</Show>
    <Show when={detail()} keyed>{view => <>
      <Show when={view.kind === "review" ? view.recording : undefined} keyed>{recording => <>
        <Type as="h2" variant="h2">Review recording</Type>
        <p>Review before <time datetime={recording.detail.review.review_deadline}>{formatTime(recording.detail.review.review_deadline)}</time></p>
        <Show when={!expired()} fallback={<p role="status">The review deadline has passed. Check the queue for current reviews.</p>}>
          <section class="space-y-3" aria-label="Private recording">
            <Show when={preview()} keyed fallback={<Button variant="secondary" disabled={previewStatus() === "loading"} onClick={() => void play(recording)}>{previewStatus() === "loading" ? "Loading recording…" : "Preview recording"}</Button>}>
              {url => <video ref={element => { video = element; }} class="mx-auto aspect-[9/16] max-h-[55dvh] rounded-xl bg-black" src={url} controls playsinline preload="metadata" aria-label="Private dance recording" onError={() => { stopPreview(); setPreviewStatus("unavailable"); }} />}
            </Show>
            <Show when={previewStatus() === "unavailable"}><p role="status">The preview isn’t available. You can retry.</p></Show>
          </section>
          <section class="space-y-3" aria-label="Reference dance"><Type as="h3" variant="h3">Reference dance</Type><div class="mx-auto aspect-[9/16] max-h-[45dvh] overflow-hidden rounded-xl"><VideoPlayer postId={recording.detail.reference_post_id} state={{ playback: "ready", thumbnail: "ready" }} activation="manual" layout="card" /></div></section>
          <section class="space-y-3" aria-label="Captured review rubric"><Type as="h3" variant="h3">What to review</Type>
            <p class="whitespace-pre-wrap">{recording.rubric.rubric_text}</p>
            <Show when={recording.detail.cue.id !== "none"} fallback={<>
              <p>Dance interval: 0–{recording.detail.body.end_ms / 1000} seconds. No opening cue is required.</p>
              <p>By choosing Pass, you confirm you inspected this recording and accept the performance of the selected dance.</p>
            </>}>
              <p>Assigned cue: {cueName(recording.detail.cue.id)}. Hold for {recording.detail.cue.hold_ms / 1000} seconds between {recording.detail.cue.start_ms / 1000} and {recording.detail.cue.end_ms / 1000} seconds. Dance interval: {recording.detail.body.start_ms / 1000}–{recording.detail.body.end_ms / 1000} seconds.</p>
              <p>By choosing Pass, you confirm you inspected this recording, saw the assigned cue satisfy this rubric before the dance interval, and accept the performance of the selected dance.</p>
            </Show>
            <div class="flex flex-wrap gap-3"><Button onClick={() => void decide("passed")}>Pass</Button><Button variant="secondary" onClick={() => void decide("not_passed")}>Not passed</Button></div>
          </section>
        </Show>
      </>}</Show>
      <Show when={view.kind === "receipt" ? view.receipt : undefined} keyed>{receipt => <section aria-live="polite" class="space-y-3">
        <Show when={receipt.outcome === "applied"} fallback={<><Type as="h2" variant="h2">Decision wasn’t applied</Type><p>Check the current queue before reviewing again.</p></>}>
          <Type as="h2" variant="h2">Decision recorded</Type><p>Your {receipt.result.verdict === "passed" ? "Pass" : "Not passed"} decision was recorded at <time datetime={receipt.committed_at}>{formatTime(receipt.committed_at)}</time>.</p>
        </Show>
      </section>}</Show>
    </>}</Show>
    <Show when={props.reviewId && state().phase !== "loading"}><a class={buttonVariants({ variant: "secondary" })} href={danceOwnerPath(props.communityId)}>Back to reviews</a></Show>
  </main>;
}
export function DanceOwnerRoute() {
  const params = useParams();
  return <Show when={params.communityId} keyed>{communityId => <DanceOwnerPage communityId={communityId} reviewId={params.reviewId} />}</Show>;
}
