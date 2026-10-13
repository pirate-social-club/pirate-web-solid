import { createGuestStudyRewardPreviewReader } from "./guest-study-financial-api";
import { Title } from "@solidjs/meta";
import { isServer } from "@solidjs/web";
import { For, Show, createEffect, createSignal, onCleanup, untrack } from "solid-js";
import { Button, Type } from "../../design-system";
import { usePageUiLocale } from "../../lib/ui-locale.tsx";
import { getLocaleMessages, interpolateMessage } from "../../locales";
import { createGuestStudyApi, type GuestStudyApi, type GuestStudyPreparedContent, type GuestStudySession } from "./guest-study-api";
import { createGuestStudyAnswerJournal, createPageGuestStudyAnswerJournal, type GuestStudyAnswerJournal } from "./guest-study-answer-journal";
import { GuestStudyDataControls } from "./guest-study-data-controls";
import { createGuestStudyPublicReader, type GuestStudyPublicReader } from "./guest-study-public-reader";
import { createGuestStudyRuntimeClient } from "./guest-study-runtime-client";
import { createGuestStudyStartCoordinator } from "./guest-study-start-coordinator";
import { GuestStudyRewardControls } from "./guest-study-reward-controls";
import { rewardPreviewMatchesRoute, guestParticipationStatus, type AcceptedGuestRewardPreview, type GuestStudyRewardPreviewReader } from "./guest-study-reward-model";
import type { StudyLearnerBand } from "./study-v2-api";
import { createStudyingBrowserRecorder } from "./studying-browser-recorder";
import type { StudyingClient, StudyingRecorder } from "./studying-route-model";
import { StudyRouteLoadingState } from "./studying-route-states";
import { StudyingRouteView } from "./studying-route-view";

type StartCoordinator = Pick<ReturnType<typeof createGuestStudyStartCoordinator>, "start" | "resume" | "renew" | "selectedCredentialId">;
type Loaded = { communityId: string; prepared: GuestStudyPreparedContent; acceptedPreview?: AcceptedGuestRewardPreview | null };
type ActiveLesson = { readOnlyRecovery: boolean; session: GuestStudySession; client: StudyingClient; credentialId: string; recoveryProfile: "persistent" | "page_only"; disclosure: GuestStudyPreparedContent["disclosure"] | undefined; disclosureAccepted: boolean };

export interface GuestStudyRouteViewProps {
  postId: string;
  /** Community from the already-authoritative public post response, if present. */
  communityId?: string;
  api?: GuestStudyApi;
  publicReader?: GuestStudyPublicReader;
  /** Concrete genuine119 v2 adapter is required;118 public v1 never authorizes rewarded start. */
  rewardPreviewReader?: GuestStudyRewardPreviewReader;
  startCoordinator?: StartCoordinator;
  /** Immutable injected protocol factory for this mounted route instance. */
  answerJournal?: GuestStudyAnswerJournal;
  recorder?: StudyingRecorder;
  onExit?: () => void;
  onKaraoke?: () => void;
  /** Parent pins this Guest branch before any authority/start request. */
  onGuestFlowEntered?: () => void;
}

/** Public preparation first; guest authority begins only with a deliberate action. */
export function GuestStudyRouteView(props: GuestStudyRouteViewProps) {
  const copy = getLocaleMessages(usePageUiLocale(), "routes").guestStudy;
  const rewardCopy = getLocaleMessages(usePageUiLocale(), "routes").guestStudyRewards;
  const [acceptReward, setAcceptReward] = createSignal(false);
  const [loaded, setLoaded] = createSignal<Loaded>();
  const [lesson, setLesson] = createSignal<ActiveLesson>();
  const [loading, setLoading] = createSignal(true);
  const [busy, setBusy] = createSignal(false);
  const [pending, setPending] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [selectedCredential, setSelectedCredential] = createSignal<string | null>(null);
  const [accepted, setAccepted] = createSignal(false);
  const [targetLanguage, setTargetLanguage] = createSignal("");
  const [learnerBand, setLearnerBand] = createSignal<StudyLearnerBand | "">("");
  let active = true;
  let originalActionEntered = false;
  let generation = 0;
  let loadController: AbortController | undefined;
  let actionController: AbortController | undefined;
  // These injected factories are owned once by this mounted route. Changing
  // song scope is tracked separately below; it must not swap an in-flight
  // original dispatch or browser inventory into another factory instance.
  let api = untrack(() => props.api);
  let publicReader = untrack(() => props.publicReader);
  let rewardPreviewReader = untrack(() => props.rewardPreviewReader);
  let coordinator = untrack(() => props.startCoordinator);
  let answerJournal = untrack(() => props.answerJournal);
  const client = (): GuestStudyApi => api ??= createGuestStudyApi();
  const authority = (): StartCoordinator => coordinator ??= createGuestStudyStartCoordinator({ api: client(), origin: window.location.origin });
  const journal = (profile: "persistent" | "page_only"): GuestStudyAnswerJournal => {
    answerJournal ??= profile === "persistent"
      ? createGuestStudyAnswerJournal({ origin: window.location.origin })
      : createPageGuestStudyAnswerJournal(window.location.origin);
    return answerJournal;
  };
  const exit = () => { if (props.onExit) props.onExit(); else window.location.assign("/"); };
  const load = async () => {
    if (!active) return;
    const request = ++generation;
    const postId = props.postId;
    const communityId = props.communityId;
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    setLoading(true);
    setMessage("");
    try {
      publicReader ??= createGuestStudyPublicReader(client());
      const next = await publicReader.load(postId, controller.signal, communityId);
      if (!active || request !== generation) return;
      // The known public preparation is independently usable immediately.
      setLoaded(next); setAccepted(false); setAcceptReward(false); setLoading(false);
      rewardPreviewReader ??= createGuestStudyRewardPreviewReader({ origin: window.location.origin });
      // Optional enrichment never owns the public loading state or original start.
      void rewardPreviewReader.load(next.communityId, postId, controller.signal).then(rewarded => {
        if (!active || request !== generation || controller.signal.aborted || originalActionEntered
          || busy() || pending() || lesson() !== undefined || accepted()) return;
        if (rewarded.acceptedPreview !== null && !rewardPreviewMatchesRoute(rewarded.acceptedPreview,
          next.communityId, postId, rewarded.prepared.disclosure.version)) return;
        setLoaded({ communityId: next.communityId, ...rewarded });
      }).catch(() => {}); // Unknown offer availability supplies no rewarded authority.

    } catch {
      if (active && request === generation) setMessage(copy.unavailable);
    } finally {
      if (active && request === generation) setLoading(false);
    }
  };
  createEffect(() => ({ postId: props.postId, communityId: props.communityId }), () => {
    if (isServer) return;
    generation += 1;
    loadController?.abort(); actionController?.abort();
    queueMicrotask(() => {
      if (!active) return;
      originalActionEntered = false;
      setLesson(undefined); setLoaded(undefined); setPending(false); setBusy(false);
      setAccepted(false); setAcceptReward(false); setTargetLanguage(""); setLearnerBand("");
      void load();
    });
  });
  onCleanup(() => { active = false; generation += 1; loadController?.abort(); actionController?.abort(); });

  const readyAvailability = () => {
    const value = loaded()?.prepared.availability;
    return value?.state === "ready" ? value : undefined;
  };
  const establish = async (resume: boolean) => {
    const current = loaded();
    const communityId = current?.communityId ?? props.communityId;
    if (!active || busy() || communityId === undefined || (!resume && (!accepted() || current === undefined || readyAvailability() === undefined))) return;
    const postId = props.postId;
    const language = targetLanguage();
    const band = learnerBand();
    if (!resume && language !== "" && band === "") { setMessage(copy.chooseLevel); return; }
    originalActionEntered = true;
    props.onGuestFlowEntered?.();
    setBusy(true);
    setMessage("");
    actionController?.abort();
    const controller = new AbortController();
    actionController = controller;
    try {
      const selected = authority();
      let result: Awaited<ReturnType<StartCoordinator["start"]>>;
      if (resume) result = await selected.resume({ communityId, postId, signal: controller.signal });
      else {
        if (current === undefined) return;
        const preview = acceptReward() ? current.acceptedPreview : null;
        if (acceptReward() && (preview === undefined || preview === null)) return;
        result = await selected.start({
            communityId, postId, signal: controller.signal,
            ...(preview == null ? {} : { acceptedPreview: preview }),
            draft: {
              target_language: language || null,
              learner_band: language === "" || band === "" ? null : band,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
              reward_mode: preview == null ? "practice_only" : "megapot_guest_v1", reward_preview_terms_hash: preview?.requestHash ?? null,
              disclosure: { version: current.prepared.disclosure.version, accepted: true },
            },
          });
      }
      if (!active || controller.signal.aborted) return;
      if (result.status !== "started") {
        setPending(result.status === "pending");
        // Never echo arbitrary server details or a private locator in copy.
        setMessage(result.status === "pending" ? copy.pendingStart : copy.recoveryRequired);
        return;
      }
      if (result.session.community_id !== communityId || result.session.post_id !== postId)
        throw new Error("The returned practice session belongs to another route.");
      const originalScope = {
        origin: window.location.origin, ownerId: result.session.owner_id,
        communityId: result.session.community_id, sessionId: result.session.session_id,
      };
      const answers = journal(result.recoveryProfile);
      let readOnlyRecovery = true;
      // A recovered session may continue only with actual known clean local
      // inventory. Missing/evicted/corrupt/pending data never means absence.
      // Only the fresh acknowledged original start may register new inventory.
      if (answers.profile === result.recoveryProfile) {
        try {
          if (result.entryKind === "new_session")
            await answers.registerNewSession(originalScope, { entryKind: "new_session", session: result.session });
          readOnlyRecovery = await answers.read(originalScope) !== null;
        } catch { readOnlyRecovery = true; }
      }
      if (!active || controller.signal.aborted) return;
      const runtime = createGuestStudyRuntimeClient({
        api: client(), initialSession: result.session, readOnlyRecovery,
        origin: originalScope.origin, answerJournal: answers,
        credentialId: () => selected.selectedCredentialId(),
        onSessionChanged: next => {
          if (active) setLesson(previous => previous?.session.session_id === next.session_id ? { ...previous, session: next } : previous);
        },
      });
      setPending(false);
      setSelectedCredential(result.credentialId);
      setLesson({ readOnlyRecovery, disclosure: current?.prepared.disclosure, disclosureAccepted: accepted(), session: result.session, credentialId: result.credentialId, recoveryProfile: result.recoveryProfile, client: runtime });
    } catch {
      if (active && !controller.signal.aborted) { setPending(true); setMessage(copy.pendingStart); }
    } finally {
      if (active && actionController === controller) setBusy(false);
    }
  };

  const recoverAccess = async (): Promise<void> => {
    const result = await authority().renew();
    if (result.status !== "ready") throw new Error("Guest access remains unavailable.");
    if (active) setSelectedCredential(result.credentialId);
  };

  return (
    <>
      <Title>{copy.title}</Title>
      <Show when={!loading()} fallback={<StudyRouteLoadingState label={copy.loading} />}>
        <Show when={lesson()} fallback={(
          <div class="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-5 px-5 py-8" data-guest-study-entry>
            <Type as="h1" variant="h1">{copy.title}</Type>
            <Type as="p" variant="body">{acceptReward() && loaded()?.acceptedPreview != null ? rewardCopy.statuses.qualifying : copy.practiceOnly}</Type>
            <Show when={loaded()?.prepared.availability.state === "ready"} fallback={(
              <><Type as="p" variant="body">{copy.unavailable}</Type><Button onClick={() => { void load(); }}>{copy.retry}</Button></>
            )}>
              <Type as="p" variant="body" class="whitespace-pre-wrap" data-guest-study-disclosure>{loaded()?.prepared.disclosure.text}</Type>
              <Show when={!pending()}>
                <label class="flex items-start gap-3"><input type="checkbox" checked={accepted()} onChange={event => setAccepted(event.currentTarget.checked)} /><span>{copy.acceptDisclosure}</span></label>
                <label>{copy.language}<select class="mt-2 w-full rounded-md border border-border bg-background p-3" value={targetLanguage()} onChange={event => { setTargetLanguage(event.currentTarget.value); setLearnerBand(""); }}>
                  <option value="">{copy.sourceOnly}</option>
                  <For each={readyAvailability()?.target_languages ?? []}>{language => <option value={language}>{language}</option>}</For>
                </select></label>
                <Show when={targetLanguage() !== ""}><label>{copy.level}<select class="mt-2 w-full rounded-md border border-border bg-background p-3" value={learnerBand()} onChange={event => {
                  const value = event.currentTarget.value;
                  if (value === "" || value === "A1" || value === "A2" || value === "B1" || value === "B2" || value === "C1" || value === "C2") setLearnerBand(value);
                }}><option value="">{copy.chooseLevel}</option><For each={readyAvailability()?.learner_bands ?? []}>{band => <option value={band}>{band}</option>}</For></select></label></Show>
                <Show when={loaded()?.acceptedPreview}>{preview => <>
                  <p>{interpolateMessage(rewardCopy.offer, { drawing: preview().terms.original_drawing_id, cutoff: preview().terms.entry_cutoff_at })}</p>
                  <label class="flex items-start gap-3"><input type="checkbox" checked={acceptReward()} onChange={event => setAcceptReward(event.currentTarget.checked)} /><span>{rewardCopy.optIn}</span></label>
                </>}</Show>
                <Button disabled={!accepted() || busy()} onClick={() => { void establish(false); }}>{acceptReward() ? rewardCopy.rewardStart : copy.start}</Button>
              </Show>
            </Show>
            <Button variant="secondary" disabled={busy() || (loaded()?.communityId ?? props.communityId) === undefined} onClick={() => { void establish(true); }}>{copy.resume}</Button>
            <Show when={message() !== ""}><Type as="p" variant="body" role="status">{message()}</Type></Show>
            <Button variant="secondary" onClick={exit}>{copy.exit}</Button>
          </div>
        )}>
          {current => (
            <>
              <Show when={current().recoveryProfile === "page_only"}><p class="px-5 py-3 text-sm" role="status">{copy.pageOnly}</p></Show>
              <Show when={!current().readOnlyRecovery} fallback={(
                <div class="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-5" data-guest-study-read-only-recovery>
                  <Type as="h1" variant="h1">{copy.title}</Type>
                  <Type as="p" variant="body">{copy.reloadReadOnly}</Type>
                  <Type as="p" variant="body">{rewardCopy.statuses[guestParticipationStatus(current().session.participation)]}</Type>
                  <Type as="p" variant="caption">{current().session.lesson.resolved_card_count} / {current().session.lesson.total_card_count}</Type>
                  <Show when={current().session.status === "completed"}><Type as="p" variant="body">{copy.learningComplete}</Type></Show>
                  <Button variant="secondary" onClick={exit}>{copy.exit}</Button>
                </div>
              )}>
              <p class="px-5 py-3 text-sm" data-guest-participation-status>{rewardCopy.statuses[guestParticipationStatus(current().session.participation)]}</p>
              <StudyingRouteView
                postId={props.postId} client={current().client}
                recorder={props.recorder ?? createStudyingBrowserRecorder()}
                onExit={exit} onKaraoke={props.onKaraoke}
                rewardSlot={<p data-guest-participation-status>{rewardCopy.statuses[guestParticipationStatus(current().session.participation)]}</p>}
                guestPresentation={{
                  disclosure: current().disclosure, disclosureAccepted: current().disclosureAccepted,
                  noDisclosureDescription: copy.recordingUnavailable, exitLabel: copy.exit,
                  practiceLabel: rewardCopy.statuses[guestParticipationStatus(current().session.participation)], pendingTitle: copy.pendingAnswerTitle,
                  pendingDescription: copy.pendingAnswer, retryOriginalLabel: copy.retryOriginal,
                  authorityDescription: copy.recoveryRequired, onRecoverAccess: recoverAccess,
                }}
              />
              </Show>
              <GuestStudyRewardControls api={client()} session={current().session} credentialId={() => selectedCredential() ?? current().credentialId} />
              <GuestStudyDataControls api={client()} ownerId={current().session.owner_id} credentialId={selectedCredential() ?? current().credentialId} />
            </>
          )}
        </Show>
      </Show>
    </>
  );
}
