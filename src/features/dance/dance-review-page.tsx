import { createDanceJourneyActor, type DanceJourneyActor } from "./dance-recorder-machine";
import { DancePublicationDetails } from "./dance-publication-status";
import { createDancePublicationApi, type DancePublicationApi, type DancePublicationView } from "./dance-publication-api";
import { ApiClientError } from "@pirate/api-client";
import { isServer } from "@solidjs/web";
import { useParams } from "@solidjs/router";
import { createEffect, createSignal, onCleanup, Show, untrack } from "solid-js";
import { captureSessionAuthority } from "../../api/browser-session-events";
import { onSessionRefreshed, resolveSession, type SessionResolution } from "../../api/session";
import { ActionFooterShell, Button, buttonVariants, MobilePageHeader, Modal, ModalContent, ModalHeader, ModalTitle, Switch, Type } from "../../design-system";
import { bindPrivatePageLifecycle } from "../notifications/private-page-lifecycle";
import { createBrowserDanceJournalStore, type DanceJournalStore } from "./dance-preparation-journal";
import { danceResultPath, danceResultPresentation, type DanceResultScope } from "./dance-result-api";
import { createDanceReviewApi, danceReviewEditable, danceReviewPath, danceReviewPending, DancePostingEligibilityError, DanceReviewAuthorityError, type DancePostingEligibility, type DanceReviewApi } from "./dance-review-api";
import { createDanceReviewController, type DanceReviewIntent, type DanceReviewView } from "./dance-review-controller";

type State = { readonly phase: "loading" | "anonymous" | "unavailable" | "error" } | { readonly phase: "ready" };

/** Account-private recording management. No private read during SSR. Session,
 * route, pagehide and unmount changes abort work and remove preview access. */
export function DanceReviewPage(props: {
  readonly communityId: string;
  readonly reviewId: string;
  readonly api?: DanceReviewApi;
  readonly store?: DanceJournalStore;
  readonly session?: () => Promise<SessionResolution>;
  readonly localPreview?: string;
  readonly journey?: DanceJourneyActor;
  readonly publicationApi?: DancePublicationApi;
}) {
  const provided = untrack(() => ({ api: props.api, store: props.store, session: props.session, publicationApi: props.publicationApi, journey: props.journey }));
  const journey = untrack(() => props.journey) ?? createDanceJourneyActor({ initialReview: true }).start();
  const [snapshot, setSnapshot] = createSignal(journey.getSnapshot(), { ownedWrite: true });
  const subscription = journey.subscribe(value => setSnapshot(value));
  onCleanup(() => { subscription.unsubscribe(); if (!provided.journey) journey.stop(); });
  const publicationApi = provided.publicationApi ?? createDancePublicationApi();
  const [publication, setPublication] = createSignal<DancePublicationView | undefined>(undefined, { ownedWrite: true });
  const [observingNotice, setObservingNotice] = createSignal("", { ownedWrite: true });
  const [state, setState] = createSignal<State>({ phase: "loading" }, { ownedWrite: true });
  const [showPublicly, setShowPublicly] = createSignal(true, { ownedWrite: true });
  const [posting, setPosting] = createSignal<DancePostingEligibility | { readonly kind: "checking" }>({ kind: "checking" }, { ownedWrite: true });
  const [confirmCancel, setConfirmCancel] = createSignal(false, { ownedWrite: true });
  const [preview, setPreview] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  const [failedLocalPreview, setFailedLocalPreview] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  const [previewStatus, setPreviewStatus] = createSignal<"idle" | "loading" | "unavailable">("idle", { ownedWrite: true });
  let active = true, revision = 0, request: AbortController | undefined, previewRequest: AbortController | undefined;
  let previewTimer: ReturnType<typeof setTimeout> | undefined, video: HTMLVideoElement | undefined;
  let postingRequest: AbortController | undefined, observationRequest: AbortController | undefined;
  let observationTimer: ReturnType<typeof setTimeout> | undefined, observations = 0;
  const visible = () => document.visibilityState !== "hidden";
  const stopObservation = () => { clearTimeout(observationTimer); observationRequest?.abort(); observationRequest = undefined; };
  let scope: DanceResultScope | null = null, api: DanceReviewApi | undefined, controller: ReturnType<typeof createDanceReviewController> | undefined;
  const stopPreview = () => {
    previewRequest?.abort(); previewRequest = undefined; clearTimeout(previewTimer);
    if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
    setPreview(undefined); setPreviewStatus("idle");
  };
  const clear = () => { stopObservation(); revision++; request?.abort(); postingRequest?.abort(); setPublication(undefined); setPosting({ kind: "checking" }); stopPreview(); scope = null; controller = undefined; api = undefined; setConfirmCancel(false); setState({ phase: "loading" }); };
  const current = (attempt: number, signal: AbortSignal, communityId: string, reviewId: string) => active && !signal.aborted && revision === attempt && props.communityId === communityId && props.reviewId === reviewId;
  const fail = (error: Error) => setState({ phase: error instanceof ApiClientError && error.declaredName === "AuthError" ? "anonymous" : error instanceof ApiClientError && error.declaredName === "NotFound" ? "unavailable" : "error" });
  const apply = (view: DanceReviewView, resetChoice = true, observeNext = true) => {
    if (resetChoice) setShowPublicly(view.result.show_publicly_if_passed ?? true);
    journey.send({ type: "REVIEW_FACT", view }); setState({ phase: "ready" });
    if (!danceReviewEditable(view.result)) stopPreview();
    if (observeNext) scheduleObservation(view);
  };
  const scheduleObservation = (view = ready(), immediate = false, knownPublication = publication()) => {
    stopObservation();
    if (!view || !needsObservation(view, knownPublication) || document.visibilityState === "hidden" || busy()) return;
    if (observations >= 90) { setObservingNotice("You can leave this screen. We’ll check for updates when you return."); return; }
    observationTimer = setTimeout(() => { void observe(); }, immediate ? 0 : 3000);
  };
  const needsObservation = (view: DanceReviewView, knownPublication: DancePublicationView | undefined) => danceReviewPending(view.result)
    || (knownPublication?.post?.status !== "published" && (view.result.publication_status === "pending"
      || (view.result.publication_status === "transferred" && (!knownPublication?.post || ["processing", "manual_review"].includes(knownPublication.post.status)))));
  const observe = async () => {
    const reader = controller, expected = scope;
    if (!active || !reader || !expected || busy() || document.visibilityState === "hidden") return;
    const attempt = revision, authority = captureSessionAuthority(), pending = new AbortController(); observationRequest = pending; observations++;
    const timeout = setTimeout(() => pending.abort(), 15000);
    const owns = () => current(attempt, pending.signal, expected.communityId, expected.reviewId) && scope === expected && captureSessionAuthority() === authority;
    try {
      const next = await reader.observe(pending.signal);
      if (!owns()) return;
      const previous = ready();
      if (previous && (next.result.session_id !== previous.result.session_id || next.result.session_terms_hash !== previous.result.session_terms_hash || next.result.review_revision < previous.result.review_revision)) throw new Error("dance_review_stale_read");
      // The verdict is already confirmed. A downstream publication failure
      // must never keep the old editable review on screen.
      setObservingNotice(""); apply(next, false, false);
      let knownPublication = publication();
      if (["pending", "transferred", "failed"].includes(next.result.publication_status)) {
        const published = await publicationApi.read(expected, pending.signal);
        if (!owns()) return;
        knownPublication = published; setPublication(published);
      }
      scheduleObservation(next, false, knownPublication);
    } catch (error) {
      if (!active || revision !== attempt || scope !== expected || !visible()) return;
      if (captureSessionAuthority() !== authority || error instanceof DanceReviewAuthorityError || (error instanceof Error && /scope_changed|session_changed|account_changed|target_changed/u.test(error.message)) || (error instanceof ApiClientError && error.declaredName === "AuthError")) { clear(); fail(error instanceof Error ? error : new Error("dance_review_unavailable")); }
      else { setObservingNotice("We couldn’t check for updates. Your confirmed result is unchanged."); scheduleObservation(); }
    } finally { clearTimeout(timeout); if (observationRequest === pending) observationRequest = undefined; }
  };
  const checkPosting = async (view = ready()) => {
    const reader = api, expected = scope;
    if (!view || !danceReviewEditable(view.result) || !reader || !expected) return;
    postingRequest?.abort();
    const pending = new AbortController(); postingRequest = pending; setPosting({ kind: "checking" });
    const attempt = revision, authority = captureSessionAuthority();
    const owns = () => current(attempt, pending.signal, expected.communityId, expected.reviewId) && scope === expected && captureSessionAuthority() === authority;
    try {
      const eligibility = await reader.postingEligibility(expected, pending.signal);
      if (owns()) setPosting(eligibility);
    } catch (error) {
      if (!owns()) return;
      if (error instanceof DanceReviewAuthorityError || (error instanceof ApiClientError && error.declaredName === "AuthError")) { clear(); fail(error); }
      else setPosting({ kind: "unknown" });
    }
  };
  const load = async (recoverCommands = false) => {
    clear(); const attempt = revision, communityId = props.communityId, reviewId = props.reviewId;
    const pending = new AbortController(); request = pending;
    const owns = () => current(attempt, pending.signal, communityId, reviewId);
    try {
      const session = await (provided.session ?? resolveSession)(); if (!owns()) return;
      if (session === "anonymous") { setState({ phase: "anonymous" }); return; }
      const authority = captureSessionAuthority();
      scope = { accountId: session.userId, communityId, reviewId }; api = provided.api ?? createDanceReviewApi();
      controller = createDanceReviewController({ scope, currentScope: () => scope, store: provided.store ?? createBrowserDanceJournalStore(), api });
      const outstanding = controller.hasOutstanding();
      const view = await (recoverCommands ? controller.load(pending.signal) : controller.observe(pending.signal)); if (!owns()) return;
      if (captureSessionAuthority() !== authority) { clear(); setState({ phase: "error" }); return; }
      observations = 0; apply(view); void checkPosting(view);
      if (outstanding && !recoverCommands) { stopObservation(); journey.send({ type: "REVIEW_ERROR", error: new Error("dance_review_original_pending") }); setObservingNotice("An earlier request still needs confirmation. Resume the same submission."); }
    } catch (error) { if (owns()) fail(error instanceof Error ? error : new Error("dance_review_unavailable")); }
  };
  const act = async (intent: DanceReviewIntent) => {
    const selected = state(), selectedView = ready(), writer = controller;
    if (selected.phase !== "ready" || !selectedView || !writer || writeBlocked()) return;
    stopObservation(); journey.send({ type: "REVIEW_WRITE" });
    revision++; request?.abort(); postingRequest?.abort(); setConfirmCancel(false);
    const attempt = revision, communityId = props.communityId, reviewId = props.reviewId, authority = captureSessionAuthority();
    const pending = new AbortController(); request = pending;
    try {
      const view = await writer.act(selectedView.result, intent, pending.signal);
      if (!current(attempt, pending.signal, communityId, reviewId)) return;
      if (captureSessionAuthority() !== authority) { clear(); setState({ phase: "error" }); return; }
      apply(view); void checkPosting(view);
    } catch (error) {
      if (!current(attempt, pending.signal, communityId, reviewId)) return;
      if (captureSessionAuthority() !== authority) { clear(); setState({ phase: "error" }); return; }
      if (error instanceof DanceReviewAuthorityError || (error instanceof ApiClientError && error.declaredName === "AuthError")) { clear(); fail(error); }
      else if (error instanceof DancePostingEligibilityError) { setPosting(error.eligibility); apply(selectedView, false); }
      else { journey.send({ type: "REVIEW_ERROR", error }); setObservingNotice("Your request could not be confirmed. Resume it without making a new submission."); }
    }
  };
  const play = async () => {
    const selected = ready(), reader = api, expected = scope;
    if (!selected || !reader || !expected) return;
    stopPreview(); setPreviewStatus("loading");
    const attempt = revision, authority = captureSessionAuthority(), pending = new AbortController(); previewRequest = pending;
    try {
      const grant = await reader.media(expected, selected.result, pending.signal);
      if (!current(attempt, pending.signal, expected.communityId, expected.reviewId) || scope !== expected) return;
      if (captureSessionAuthority() !== authority) { clear(); return; }
      const expires = Math.min(grant.expires_at_ms, Date.parse(selected.result.review_deadline));
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
  const visibility = () => {
    if (document.visibilityState === "hidden") { stopObservation(); stopPreview(); }
    else { observations = 0; scheduleObservation(undefined, true); }
  };
  const online = () => { observations = 0; scheduleObservation(undefined, true); };
  if (!isServer) { document.addEventListener("visibilitychange", visibility); window.addEventListener("online", online); }
  onCleanup(() => { stopObservation(); if (!isServer) { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("online", online); } });
  onCleanup(onSessionRefreshed(() => { void load(); }));
  onCleanup(bindPrivatePageLifecycle(clear));
  onCleanup(() => { active = false; clear(); });
  const ready = () => state().phase === "ready" ? snapshot().context.review ?? undefined : undefined;
  const busy = () => snapshot().matches({ review: "submitting" });
  const writeBlocked = () => busy() || snapshot().matches({ review: "error" });
  const postingMessage = () => {
    const value = posting();
    if (value.kind === "checking") return "Checking public posting access…";
    if (value.kind === "eligible") return "Posting access confirmed. It must still be available when your video is published.";
    if (value.kind === "unknown") return "We couldn’t confirm public posting access. Turn off ‘Show publicly if it passes’ to submit privately, or check again.";
    switch (value.join.kind) {
      case "verify": case "verify_document": return "Verify and join this community before submitting for public posting. You can also turn off ‘Show publicly if it passes’ and submit privately.";
      case "join": case "request": return "Join this community before submitting for public posting. You can also turn off ‘Show publicly if it passes’ and submit privately.";
      case "pending": return "Your community membership is pending. You can submit privately by turning off ‘Show publicly if it passes’.";
      default: return "Public posting is unavailable in this community. You can submit privately by turning off ‘Show publicly if it passes’.";
    }
  };
  const communityAction = () => {
    const value = posting(); if (value.kind !== "unavailable") return undefined;
    switch (value.join.kind) {
      case "verify": case "verify_document": return "Verify to join";
      case "join": return "Join community";
      case "request": return "Request membership";
      default: return "View community";
    }
  };
  const publicUnavailable = () => showPublicly() && posting().kind !== "eligible";
  return <main class="h-dvh bg-background" data-dance-review={state().phase}>
    <h1 class="sr-only">Your recording</h1>
    <ActionFooterShell fullViewport header={<MobilePageHeader title="Your recording" density="compact" onBackClick={() => { window.location.href = ready() ? `/post/${encodeURIComponent(ready()!.result.song_post_id)}` : `/c/${encodeURIComponent(props.communityId)}`; }} />}
      bodyClass="relative flex flex-col gap-4 px-4 pt-[calc(4rem+env(safe-area-inset-top))]"
      footer={<div class="mx-auto grid w-full max-w-md gap-3">
        <Show when={ready()}>{view => <>
          <Show when={danceReviewEditable(view().result)}>
            <div class="flex min-h-16 items-center justify-between gap-3 rounded-xl bg-card p-4">
              <span>Show publicly if it passes<span class="block text-sm text-muted-foreground">Same rewards either way.</span></span>
              <Switch aria-label="Show publicly if it passes" checked={showPublicly()} disabled={writeBlocked()} onChange={setShowPublicly} />
            </div>
            <Show when={showPublicly() && posting().kind !== "eligible"}><p class="text-sm" role="status">{postingMessage()}</p>
              <Show when={communityAction()}>{label => <a class="underline" href={`/c/${encodeURIComponent(props.communityId)}`}>{label()}</a>}</Show>
              <Button variant="secondary" disabled={posting().kind === "checking" || busy()} onClick={() => void checkPosting()}>Check posting access</Button>
              <Button variant="secondary" disabled={writeBlocked()} onClick={() => setShowPublicly(false)}>Keep this take private</Button>
            </Show>
            <Show when={view().result.state === "uploaded"} fallback={<Button disabled={writeBlocked() || publicUnavailable() || showPublicly() === view().result.show_publicly_if_passed} onClick={() => void act({ operation: "visibility", showPublicly: showPublicly() })}>Save publication choice</Button>}>
              <Button disabled={writeBlocked() || publicUnavailable()} onClick={() => void act({ operation: "submit", showPublicly: showPublicly() })}>{busy() ? "Submitting…" : "Submit for review"}</Button>
            </Show>
          </Show>
          <Show when={snapshot().matches({ review: "error" })}><Button onClick={() => void load(true)}>Resume submission</Button></Show>
          <Show when={view().result.state !== "uploaded"}><a class={buttonVariants({ variant: "secondary" })} href={`/post/${encodeURIComponent(view().result.song_post_id)}`}>Done</a></Show>
        </>}</Show>
      </div>}>
    <Show when={state().phase === "loading"}><p aria-busy="true">Checking your recording…</p></Show>
    <Show when={state().phase === "anonymous"}><p>Sign in to view your recording.</p><a class={buttonVariants({ variant: "secondary" })} href={`/auth/sign-in?return_to=${encodeURIComponent(danceReviewPath(props.communityId, props.reviewId))}`}>Sign in</a></Show>
    <Show when={state().phase === "unavailable"}><p role="alert">This recording is not available.</p></Show>
    <Show when={state().phase === "error"}><p role="alert">We couldn’t confirm your recording’s status.</p><Button variant="secondary" onClick={() => void load()}>Check again</Button></Show>
    <Show when={ready()}>{view => <>
      <section class={view().result.state === "uploaded" ? "sr-only" : "space-y-3"} aria-live="polite">
        <Type as="h2" variant="h2">{danceResultPresentation(view().result).title}</Type>
        <p>{danceResultPresentation(view().result).detail}</p>
        <Show when={view().receipt?.outcome === "refused"}><p role="status">Your request wasn’t applied. This is the current recording status.</p></Show>
      </section>
      <Show when={danceReviewEditable(view().result)}>
        <Show when={(props.localPreview !== failedLocalPreview() ? props.localPreview : undefined) || preview()} fallback={<Button variant="secondary" disabled={busy() || previewStatus() === "loading"} onClick={() => void play()}>{previewStatus() === "loading" ? "Loading recording…" : "Preview recording"}</Button>}>
          {url => <video ref={element => { video = element; onCleanup(() => { element.pause(); element.removeAttribute("src"); element.load(); }); }} class="mx-auto min-h-0 w-full flex-1 bg-black object-contain" src={url()} controls playsinline preload="metadata" aria-label="Your private recording" onError={() => { setFailedLocalPreview(props.localPreview); stopPreview(); setPreviewStatus("unavailable"); }} />}
        </Show>
        <Show when={previewStatus() === "unavailable"}><p role="status">The preview isn’t available. You can retry.</p></Show>
      </Show>
      <Show when={danceReviewPending(view().result)}><p class="text-sm text-muted-foreground">Review deadline: <time datetime={view().result.review_deadline}>{new Date(view().result.review_deadline).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time></p></Show>
      <Show when={["pending", "transferred", "failed"].includes(view().result.publication_status)}><DancePublicationDetails initialStatus={view().result.publication_status} view={publication()} /></Show>
      <Show when={danceReviewEditable(view().result)}><details class="text-sm"><summary class="cursor-pointer text-muted-foreground">Recording options</summary><Button variant="ghost" disabled={writeBlocked()} onClick={() => setConfirmCancel(true)}>Cancel review</Button></details></Show>
      <Show when={!danceReviewEditable(view().result)}><a class="text-sm underline" href={danceResultPath(props.communityId, props.reviewId)}>View dance result</a></Show>
    </>}</Show>
    <Show when={observingNotice()}><p role="status">{observingNotice()}</p></Show>
    </ActionFooterShell>
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
