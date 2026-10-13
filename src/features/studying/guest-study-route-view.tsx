import { Title } from "@solidjs/meta";
import { isServer } from "@solidjs/web";
import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Button, Type } from "../../design-system";
import { usePageUiLocale } from "../../lib/ui-locale.tsx";
import { getLocaleMessages } from "../../locales";
import { createGuestStudyApi, type GuestStudyApi, type GuestStudyPreparedContent, type GuestStudySession } from "./guest-study-api";
import { GuestStudyDataControls } from "./guest-study-data-controls";
import { createGuestStudyPublicReader, type GuestStudyPublicReader } from "./guest-study-public-reader";
import { createGuestStudyRuntimeClient } from "./guest-study-runtime-client";
import { createGuestStudyStartCoordinator } from "./guest-study-start-coordinator";
import type { StudyLearnerBand } from "./study-v2-api";
import { createStudyingBrowserRecorder } from "./studying-browser-recorder";
import type { StudyingClient, StudyingRecorder } from "./studying-route-model";
import { StudyRouteLoadingState } from "./studying-route-states";
import { StudyingRouteView } from "./studying-route-view";

type StartCoordinator = Pick<ReturnType<typeof createGuestStudyStartCoordinator>, "start" | "resume" | "renew" | "selectedCredentialId">;
type Loaded = { communityId: string; prepared: GuestStudyPreparedContent };
type ActiveLesson = { readOnlyRecovery: boolean; session: GuestStudySession; client: StudyingClient; credentialId: string; recoveryProfile: "persistent" | "page_only"; disclosure: GuestStudyPreparedContent["disclosure"] | undefined; disclosureAccepted: boolean };

export interface GuestStudyRouteViewProps {
  postId: string;
  /** Community from the already-authoritative public post response, if present. */
  communityId?: string;
  api?: GuestStudyApi;
  publicReader?: GuestStudyPublicReader;
  startCoordinator?: StartCoordinator;
  recorder?: StudyingRecorder;
  onExit?: () => void;
  onKaraoke?: () => void;
  /** Parent pins this Guest branch before any authority/start request. */
  onGuestFlowEntered?: () => void;
}

/** Public preparation first; guest authority begins only with a deliberate action. */
export function GuestStudyRouteView(props: GuestStudyRouteViewProps) {
  const copy = getLocaleMessages(usePageUiLocale(), "routes").guestStudy;
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
  let generation = 0;
  let loadController: AbortController | undefined;
  let actionController: AbortController | undefined;
  let api = props.api;
  let publicReader = props.publicReader;
  let coordinator = props.startCoordinator;
  const client = (): GuestStudyApi => api ??= createGuestStudyApi();
  const authority = (): StartCoordinator => coordinator ??= createGuestStudyStartCoordinator({ api: client(), origin: window.location.origin });
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
      setLoaded(next);
      setAccepted(false);
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
      setLesson(undefined); setLoaded(undefined); setPending(false); setBusy(false);
      setAccepted(false); setTargetLanguage(""); setLearnerBand("");
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
        result = await selected.start({
            communityId, postId, signal: controller.signal,
            draft: {
              target_language: language || null,
              learner_band: language === "" || band === "" ? null : band,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
              reward_mode: "practice_only", reward_preview_terms_hash: null,
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
      // A successful lookup/old original-key replay is not a newly initialized
      // browser answer inventory. Until the typed coordinator successor
      // supplies actual fresh-start provenance, fail closed to review only.
      const readOnlyRecovery = resume || !("entryKind" in result && result.entryKind === "new_session");
      const runtime = createGuestStudyRuntimeClient({
        api: client(), initialSession: result.session, readOnlyRecovery,
        credentialId: () => selected.selectedCredentialId(),
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
            <Type as="p" variant="body">{copy.practiceOnly}</Type>
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
                <Button disabled={!accepted() || busy()} onClick={() => { void establish(false); }}>{copy.start}</Button>
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
                  <Type as="p" variant="body">{copy.practiceOnly}</Type>
                  <Type as="p" variant="caption">{current().session.lesson.resolved_card_count} / {current().session.lesson.total_card_count}</Type>
                  <Show when={current().session.status === "completed"}><Type as="p" variant="body">{copy.learningComplete}</Type></Show>
                  <Button variant="secondary" onClick={exit}>{copy.exit}</Button>
                </div>
              )}>
              <p class="px-5 py-3 text-sm" data-guest-practice-only>{copy.practiceOnly}</p>
              <StudyingRouteView
                postId={props.postId} client={current().client}
                recorder={props.recorder ?? createStudyingBrowserRecorder()}
                onExit={exit} onKaraoke={props.onKaraoke}
                rewardSlot={<p data-guest-practice-only>{copy.practiceOnly}</p>}
                guestPresentation={{
                  disclosure: current().disclosure, disclosureAccepted: current().disclosureAccepted,
                  noDisclosureDescription: copy.recordingUnavailable, exitLabel: copy.exit,
                  practiceLabel: copy.practiceOnly, pendingTitle: copy.pendingAnswerTitle,
                  pendingDescription: copy.pendingAnswer, retryOriginalLabel: copy.retryOriginal,
                  authorityDescription: copy.recoveryRequired, onRecoverAccess: recoverAccess,
                }}
              />
              </Show>
              <GuestStudyDataControls api={client()} ownerId={current().session.owner_id} credentialId={selectedCredential() ?? current().credentialId} />
            </>
          )}
        </Show>
      </Show>
    </>
  );
}
