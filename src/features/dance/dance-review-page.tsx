import { ApiClientError } from "@pirate/api-client";
import { isServer } from "@solidjs/web";
import { useParams } from "@solidjs/router";
import { createEffect, createSignal, onCleanup, Show, untrack } from "solid-js";
import { captureSessionAuthority } from "../../api/browser-session-events";
import { onSessionRefreshed, resolveSession, type SessionResolution } from "../../api/session";
import { Button, buttonVariants, Modal, ModalContent, ModalHeader, ModalTitle, Type } from "../../design-system";
import { bindPrivatePageLifecycle } from "../notifications/private-page-lifecycle";
import { createBrowserDanceJournalStore, type DanceJournalStore } from "./dance-preparation-journal";
import { danceResultPath, danceResultPresentation, type DanceResultScope } from "./dance-result-api";
import { createDanceReviewApi, danceReviewEditable, danceReviewPath, danceReviewPending, type DanceReviewApi } from "./dance-review-api";
import { createDanceReviewController, type DanceReviewIntent, type DanceReviewView } from "./dance-review-controller";

type State = { readonly phase: "loading" | "anonymous" | "unavailable" | "error" } | { readonly phase: "ready"; readonly view: DanceReviewView };

/** Account-private recording management. No private read during SSR. Session,
 * route, pagehide and unmount changes abort work and remove preview access. */
export function DanceReviewPage(props: {
  readonly communityId: string;
  readonly reviewId: string;
  readonly api?: DanceReviewApi;
  readonly store?: DanceJournalStore;
  readonly session?: () => Promise<SessionResolution>;
}) {
  const provided = untrack(() => ({ api: props.api, store: props.store, session: props.session }));
  const [state, setState] = createSignal<State>({ phase: "loading" }, { ownedWrite: true });
  const [showPublicly, setShowPublicly] = createSignal(true, { ownedWrite: true });
  const [confirmCancel, setConfirmCancel] = createSignal(false, { ownedWrite: true });
  const [preview, setPreview] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  const [previewStatus, setPreviewStatus] = createSignal<"idle" | "loading" | "unavailable">("idle", { ownedWrite: true });
  let active = true, revision = 0, request: AbortController | undefined, previewRequest: AbortController | undefined;
  let previewTimer: ReturnType<typeof setTimeout> | undefined, video: HTMLVideoElement | undefined;
  let scope: DanceResultScope | null = null, api: DanceReviewApi | undefined, controller: ReturnType<typeof createDanceReviewController> | undefined;
  const stopPreview = () => {
    previewRequest?.abort(); previewRequest = undefined; clearTimeout(previewTimer);
    if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
    setPreview(undefined); setPreviewStatus("idle");
  };
  const clear = () => { revision++; request?.abort(); stopPreview(); scope = null; controller = undefined; api = undefined; setConfirmCancel(false); setState({ phase: "loading" }); };
  const current = (attempt: number, signal: AbortSignal, communityId: string, reviewId: string) => active && !signal.aborted && revision === attempt && props.communityId === communityId && props.reviewId === reviewId;
  const fail = (error: Error) => setState({ phase: error instanceof ApiClientError && error.declaredName === "AuthError" ? "anonymous" : error instanceof ApiClientError && error.declaredName === "NotFound" ? "unavailable" : "error" });
  const apply = (view: DanceReviewView) => { setShowPublicly(view.result.show_publicly_if_passed ?? true); setState({ phase: "ready", view }); };
  const load = async () => {
    clear(); const attempt = revision, communityId = props.communityId, reviewId = props.reviewId;
    const pending = new AbortController(); request = pending;
    const owns = () => current(attempt, pending.signal, communityId, reviewId);
    try {
      const session = await (provided.session ?? resolveSession)(); if (!owns()) return;
      if (session === "anonymous") { setState({ phase: "anonymous" }); return; }
      const authority = captureSessionAuthority();
      scope = { accountId: session.userId, communityId, reviewId }; api = provided.api ?? createDanceReviewApi();
      controller = createDanceReviewController({ scope, currentScope: () => scope, store: provided.store ?? createBrowserDanceJournalStore(), api });
      const view = await controller.load(pending.signal); if (!owns()) return;
      if (captureSessionAuthority() !== authority) { clear(); setState({ phase: "error" }); return; }
      apply(view);
    } catch (error) { if (owns()) fail(error instanceof Error ? error : new Error("dance_review_unavailable")); }
  };
  const act = async (intent: DanceReviewIntent) => {
    const selected = state(), writer = controller;
    if (selected.phase !== "ready" || !writer) return;
    revision++; request?.abort(); stopPreview(); setConfirmCancel(false); setState({ phase: "loading" });
    const attempt = revision, communityId = props.communityId, reviewId = props.reviewId, authority = captureSessionAuthority();
    const pending = new AbortController(); request = pending;
    try {
      const view = await writer.act(selected.view.result, intent, pending.signal);
      if (!current(attempt, pending.signal, communityId, reviewId)) return;
      if (captureSessionAuthority() !== authority) { clear(); setState({ phase: "error" }); return; }
      apply(view);
    } catch (error) { if (current(attempt, pending.signal, communityId, reviewId)) fail(error instanceof Error ? error : new Error("dance_review_unavailable")); }
  };
  const play = async () => {
    const selected = state(), reader = api, expected = scope;
    if (selected.phase !== "ready" || !reader || !expected) return;
    stopPreview(); setPreviewStatus("loading");
    const attempt = revision, authority = captureSessionAuthority(), pending = new AbortController(); previewRequest = pending;
    try {
      const grant = await reader.media(expected, selected.view.result, pending.signal);
      if (!current(attempt, pending.signal, expected.communityId, expected.reviewId) || scope !== expected) return;
      if (captureSessionAuthority() !== authority) { clear(); return; }
      const expires = Math.min(grant.expires_at_ms, Date.parse(selected.view.result.review_deadline));
      if (!Number.isFinite(expires) || expires <= Date.now()) throw new Error("dance_review_media_expired");
      // Revalidate even injected adapters. Only this exact cookie-authorized
      // endpoint may be attached to a private video element.
      const path = `/api/communities/${encodeURIComponent(expected.communityId)}/dance/reviews/${encodeURIComponent(expected.reviewId)}/media/${encodeURIComponent(grant.lease_id)}`;
      if (grant.url !== path) throw new Error("dance_review_media_unavailable");
      setPreview(grant.url); setPreviewStatus("idle"); previewTimer = setTimeout(stopPreview, expires - Date.now());
    } catch { if (current(attempt, pending.signal, expected.communityId, expected.reviewId)) { stopPreview(); setPreviewStatus("unavailable"); } }
  };
  createEffect(() => [props.communityId, props.reviewId] as const, () => {
    clear(); const attempt = revision;
    if (!isServer) queueMicrotask(() => { if (active && attempt === revision) void load(); });
  });
  onCleanup(onSessionRefreshed(() => { void load(); }));
  onCleanup(bindPrivatePageLifecycle(clear));
  onCleanup(() => { active = false; clear(); });
  const ready = () => { const value = state(); return value.phase === "ready" ? value.view : undefined; };
  return <main class="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-8" data-dance-review={state().phase}>
    <Type as="h1" variant="h1">Your recording</Type>
    <Show when={state().phase === "loading"}><p aria-busy="true">Checking your recording…</p></Show>
    <Show when={state().phase === "anonymous"}><p>Sign in to view your recording.</p><a class={buttonVariants({ variant: "secondary" })} href={`/auth/sign-in?return_to=${encodeURIComponent(danceReviewPath(props.communityId, props.reviewId))}`}>Sign in</a></Show>
    <Show when={state().phase === "unavailable"}><p role="alert">This recording is not available.</p></Show>
    <Show when={state().phase === "error"}><p role="alert">We couldn’t confirm your recording’s status.</p><Button variant="secondary" onClick={() => void load()}>Check again</Button></Show>
    <Show when={ready()}>{view => <>
      <section class="space-y-3" aria-live="polite">
        <Type as="h2" variant="h2">{danceResultPresentation(view().result).title}</Type>
        <p>{danceResultPresentation(view().result).detail}</p>
        <Show when={view().receipt?.outcome === "refused"}><p role="status">Your request wasn’t applied. This is the current recording status.</p></Show>
      </section>
      <Show when={danceReviewEditable(view().result)}>
        <Show when={preview()} fallback={<Button variant="secondary" disabled={previewStatus() === "loading"} onClick={() => void play()}>{previewStatus() === "loading" ? "Loading recording…" : "Preview recording"}</Button>}>
          {url => <video ref={element => { video = element; }} class="mx-auto aspect-[9/16] max-h-[55dvh] rounded-xl bg-black" src={url()} controls playsinline preload="metadata" aria-label="Your private recording" onError={() => { stopPreview(); setPreviewStatus("unavailable"); }} />}
        </Show>
        <Show when={previewStatus() === "unavailable"}><p role="status">The preview isn’t available. You can retry.</p></Show>
        <label class="flex min-h-11 items-center gap-3"><input type="checkbox" checked={showPublicly()} onChange={event => setShowPublicly(event.currentTarget.checked)} /><span>Show publicly if it passes</span></label>
        <Show when={view().result.state === "uploaded"} fallback={
          <Button disabled={showPublicly() === view().result.show_publicly_if_passed} onClick={() => void act({ operation: "visibility", showPublicly: showPublicly() })}>Save publication choice</Button>
        }><Button onClick={() => void act({ operation: "submit", showPublicly: showPublicly() })}>Submit</Button></Show>
      </Show>
      <Show when={danceReviewPending(view().result)}><p class="text-sm text-muted-foreground">Review deadline: <time datetime={view().result.review_deadline}>{new Date(view().result.review_deadline).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time></p></Show>
      <Show when={view().result.publication_status === "pending"}><p>Your separate video post is being prepared.</p></Show>
      <Show when={view().result.publication_status === "failed"}><p>The video post could not be created. Your private result is unchanged.</p></Show>
      <a class={buttonVariants({ variant: "secondary" })} href={`/post/${encodeURIComponent(view().result.song_post_id)}`}>Done</a>
      <Show when={danceReviewEditable(view().result)}><Button variant="ghost" onClick={() => setConfirmCancel(true)}>Cancel review</Button></Show>
      <Show when={!danceReviewEditable(view().result)}><a class="text-sm underline" href={danceResultPath(props.communityId, props.reviewId)}>View dance result</a></Show>
    </>}</Show>
    <Modal open={confirmCancel()} onOpenChange={setConfirmCancel}>
      <ModalContent><ModalHeader><ModalTitle>Cancel review of this recording?</ModalTitle></ModalHeader>
        <p>It won’t be reviewed or posted.</p>
        <Button onClick={() => void act({ operation: "withdraw" })}>Cancel review</Button><Button variant="secondary" onClick={() => setConfirmCancel(false)}>Keep waiting</Button>
      </ModalContent>
    </Modal>
  </main>;
}

export function DanceReviewRoute() {
  const params = useParams();
  return <Show when={params.communityId} keyed>{communityId => <Show when={params.reviewId} keyed>{reviewId => <DanceReviewPage communityId={communityId} reviewId={reviewId} />}</Show>}</Show>;
}
