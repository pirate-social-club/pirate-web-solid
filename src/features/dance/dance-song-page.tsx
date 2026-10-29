import { ApiClientError } from "@pirate/api-client";
import { isServer } from "@solidjs/web";
import { useParams } from "@solidjs/router";
import { createEffect, createSignal, For, onCleanup, Show, untrack } from "solid-js";
import { captureSessionAuthority } from "../../api/browser-session-events";
import { onSessionRefreshed, resolveSession, type AuthenticatedSession, type SessionResolution } from "../../api/session";
import { Button, buttonVariants, IconArrowLeft, IconButton, Type } from "../../design-system";
import { createCommunityProfileAttempt } from "../identity/community-profile-attempt";
import { communityOperationPersonas, type CommunityPersonaChoice } from "../identity/community-persona-choice";
import { CommunityPersonaChoiceDialog } from "../identity/community-persona-choice-sheet";
import { bindPrivatePageLifecycle } from "../notifications/private-page-lifecycle";
import { videoPosterPath } from "../posts/video-submission/playback-access";
import { VideoPlayer } from "../posts/video-submission/video-player";
import { useVideoPlaybackSeams } from "../posts/video-submission/video-playback-seams";
import { createDancePreparationApi, type DancePreparationOptions } from "./dance-preparation-api";
import type { DanceJournalScope, DanceJournalStore } from "./dance-preparation-journal";
import { DanceRecorderPanel } from "./dance-recorder-panel";
import type { createDanceRecorder } from "./dance-recorder";
import { assertDanceResult, danceResultPath, danceResultPresentation, type DanceResult } from "./dance-result-api";
import type { DanceReviewApi } from "./dance-review-api";
import { danceReviewPath, danceReviewPending } from "./dance-review-api";
import { danceSongPath } from "./dance-song-path";
import { danceOwnerPath } from "./dance-owner-path";

type Api = ReturnType<typeof createDancePreparationApi>;
type Choice = DancePreparationOptions["choreographies"][number];
type State = { readonly phase: "loading" | "anonymous" | "error" } | { readonly phase: "ready"; readonly session: AuthenticatedSession; readonly options: DancePreparationOptions; readonly owner: boolean };
type Detail = { readonly target: Choice; readonly latest: DanceResult | null; readonly fixedPersonaId: string | null };

/** Existing ready references -> exact-community profile -> private recording.
 * Options, latest results and session context are account-private browser reads. */
export function DanceSongPage(props: {
  readonly communityId: string;
  readonly postId: string;
  readonly api?: Api;
  readonly session?: () => Promise<SessionResolution>;
  readonly prepareProfile?: ReturnType<typeof createCommunityProfileAttempt>;
  readonly recorder?: typeof createDanceRecorder;
  readonly store?: DanceJournalStore;
  readonly reviewApi?: DanceReviewApi;
}) {
  const seams = untrack(() => ({ api: props.api, session: props.session, prepareProfile: props.prepareProfile, recorder: props.recorder, store: props.store, reviewApi: props.reviewApi }));
  const playback = useVideoPlaybackSeams();
  const [state, setState] = createSignal<State>({ phase: "loading" }, { ownedWrite: true });
  const [detail, setDetail] = createSignal<Detail | null>(null, { ownedWrite: true });
  const [selected, setSelected] = createSignal<Choice | null>(null, { ownedWrite: true });
  const [personaId, setPersonaId] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  const [profileOpen, setProfileOpen] = createSignal(false, { ownedWrite: true });
  const [message, setMessage] = createSignal("", { ownedWrite: true });
  const [busy, setBusy] = createSignal(false, { ownedWrite: true });
  const [recording, setRecording] = createSignal<DanceJournalScope | null>(null, { ownedWrite: true });
  let alive = true, generation = 0, selection = 0, request: AbortController | undefined, detailRequest: AbortController | undefined, api: Api | undefined;
  const ready = () => { const value = state(); return value.phase === "ready" ? value : undefined; };
  const profiles = () => { const value = ready(); return value ? communityOperationPersonas(value.session.personas, props.communityId) : []; };
  const profileLabel = () => ready()?.session.personas.find(value => value.personaId === personaId())?.displayName ?? ready()?.session.personas.find(value => value.personaId === personaId())?.primaryPublicHandle ?? "Choose profile";
  const clear = () => { generation++; selection++; request?.abort(); detailRequest?.abort(); api = undefined; setState({ phase: "loading" }); setDetail(null); setSelected(null); setRecording(null); setPersonaId(undefined); setProfileOpen(false); setBusy(false); setMessage(""); };
  const load = async () => {
    clear(); const attempt = generation, communityId = props.communityId, postId = props.postId, pending = new AbortController(); request = pending;
    const owns = () => alive && attempt === generation && !pending.signal.aborted && props.communityId === communityId && props.postId === postId;
    try {
      const session = await (seams.session ?? resolveSession)(); if (!owns()) return;
      if (session === "anonymous") { setState({ phase: "anonymous" }); return; }
      if (session.personasUnavailable) throw new Error("profiles_unavailable");
      const authority = captureSessionAuthority(), reader = seams.api ?? createDancePreparationApi(); api = reader;
      const scope = { accountId: session.userId, communityId, postId };
      const [options, owner] = await Promise.all([reader.options(scope, undefined, pending.signal), reader.owner(scope, pending.signal)]);
      if (!owns()) return;
      if (captureSessionAuthority() !== authority) { clear(); return; }
      const available = communityOperationPersonas(session.personas, communityId);
      setPersonaId(available.length === 1 ? available[0]!.personaId : undefined);
      setState({ phase: "ready", session, options, owner });
    } catch (error) {
      if (owns()) setState({ phase: error instanceof ApiClientError && error.declaredName === "AuthError" ? "anonymous" : "error" });
    }
  };
  const choose = async (target: Choice) => {
    const value = ready(), reader = api; if (!value || !reader) return;
    const attempt = generation, chosen = ++selection, communityId = props.communityId, postId = props.postId, pending = new AbortController(); detailRequest?.abort(); detailRequest = pending;
    const owns = () => alive && generation === attempt && selection === chosen && !pending.signal.aborted;
    setSelected(target); setDetail(null); setRecording(null); setMessage(""); setBusy(true);
    try {
      const scope = { accountId: value.session.userId, communityId, postId };
      const latest = await reader.latest(scope, { choreographyId: target.choreography_id, revision: target.revision }, pending.signal); if (!owns()) return;
      if (latest.latest_submitted) assertDanceResult(latest.latest_submitted, { ...scope, reviewId: latest.latest_submitted.review_id });
      let fixedPersonaId: string | null = null;
      if (latest.active_session_id !== null) {
        const context = await reader.context(scope, latest.active_session_id, pending.signal); if (!owns()) return;
        if (context.session.choreography_id !== target.choreography_id || context.session.choreography_revision !== target.revision
          || !communityOperationPersonas(value.session.personas, communityId).some(profile => profile.personaId === context.persona_id)) throw new Error("dance_preparation_target_changed");
        fixedPersonaId = context.persona_id; setPersonaId(context.persona_id);
      }
      setDetail({ target, latest: latest.latest_submitted, fixedPersonaId });
    } catch { if (owns()) setMessage("This dance couldn’t be loaded. Try again."); }
    finally { if (owns()) setBusy(false); }
  };
  const back = () => { selection++; detailRequest?.abort(); setSelected(null); setDetail(null); setRecording(null); setMessage(""); setBusy(false); };
  const chooseProfile = async (choice: CommunityPersonaChoice) => {
    setProfileOpen(false); const value = ready(); if (!value || detail()?.fixedPersonaId) return;
    if (choice.kind === "existing" && profiles().some(profile => profile.personaId === choice.personaId)) { setPersonaId(choice.personaId); return; }
    if (!request || busy()) return;
    const attempt = generation, pending = request; setBusy(true); setMessage("");
    try {
      await (seams.prepareProfile ?? createCommunityProfileAttempt())({ session: value.session, communityId: props.communityId, choice, signal: pending.signal });
      if (alive && attempt === generation && !pending.signal.aborted) await load();
    } catch { if (alive && attempt === generation && !pending.signal.aborted) setMessage("Your profile couldn’t be prepared. Check again."); }
    finally { if (alive && attempt === generation && !pending.signal.aborted) setBusy(false); }
  };
  const begin = async () => {
    const value = ready(), chosen = detail(), profile = personaId(), reader = api, pending = detailRequest;
    if (!value || !chosen || !reader || !profile || !pending || busy() || value.owner || !value.options.ready || !value.options.policy
      || !profiles().some(item => item.personaId === profile) || (chosen.latest && danceReviewPending(chosen.latest))) return;
    const attempt = generation, selectedRevision = selection; setBusy(true); setMessage("");
    try {
      if (await reader.owner({ accountId: value.session.userId, communityId: props.communityId, postId: props.postId }, pending.signal)) throw new Error("dance_owner_cannot_record");
      if (!alive || generation !== attempt || selection !== selectedRevision || pending.signal.aborted) return;
      setRecording({ accountId: value.session.userId, communityId: props.communityId, postId: props.postId, personaId: profile,
        choreographyId: chosen.target.choreography_id, choreographyRevision: chosen.target.revision });
    } catch { if (alive && generation === attempt && selection === selectedRevision && !pending.signal.aborted) setMessage("Recording isn’t available for this dance right now."); }
    finally { if (alive && generation === attempt && selection === selectedRevision && !pending.signal.aborted) setBusy(false); }
  };
  const more = async () => {
    const value = ready(), reader = api, pending = request; if (!value || !reader || !pending || !value.options.next_cursor || busy()) return;
    const attempt = generation; setBusy(true);
    try {
      const next = await reader.options({ accountId: value.session.userId, communityId: props.communityId, postId: props.postId }, value.options.next_cursor, pending.signal);
      if (!alive || generation !== attempt || pending.signal.aborted) return;
      if (next.policy?.policy_hash !== value.options.policy?.policy_hash) throw new Error("dance_options_changed");
      const entries = [...value.options.choreographies];
      for (const item of next.choreographies) if (!entries.some(existing => existing.choreography_id === item.choreography_id && existing.revision === item.revision)) entries.push(item);
      setState({ ...value, options: { ...next, choreographies: entries } });
    } catch { if (alive && generation === attempt && !pending.signal.aborted) setMessage("More dances couldn’t be loaded. Try again."); }
    finally { if (alive && generation === attempt && !pending.signal.aborted) setBusy(false); }
  };
  createEffect(() => [props.communityId, props.postId] as const, () => { clear(); const attempt = generation; if (!isServer) queueMicrotask(() => { if (alive && generation === attempt) void load(); }); });
  onCleanup(onSessionRefreshed(() => { void load(); }));
  onCleanup(bindPrivatePageLifecycle(clear));
  onCleanup(() => { alive = false; clear(); });
  return <div role={recording() ? undefined : "main"} class="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 p-5" data-dance-song={state().phase}>
    <Show when={!recording()}><div class="flex items-center gap-3"><a class="text-sm underline" href={`/post/${encodeURIComponent(props.postId)}`}>Back to song</a><Type as="h1" variant="body-strong">Dances</Type></div></Show>
    <Show when={state().phase === "loading"}><p aria-busy="true">Loading dances…</p></Show>
    <Show when={state().phase === "anonymous"}><p>Sign in to do this dance.</p><a class={buttonVariants({ variant: "secondary" })} href={`/auth/sign-in?return_to=${encodeURIComponent(danceSongPath(props.communityId, props.postId))}`}>Sign in</a></Show>
    <Show when={state().phase === "error"}><p role="alert">Dances couldn’t be loaded.</p><Button variant="secondary" onClick={() => void load()}>Check again</Button></Show>
    <Show when={ready()} keyed>{value => <>
      <Show when={!recording()}>
      <Show when={value.options.choreographies.length > 0} fallback={<p>No dances are available for this song yet.</p>}>
        <div class="grid grid-cols-3 gap-2" aria-label="Dances for this song"><For each={value.options.choreographies}>{(target, index) =>
          <button type="button" class="relative aspect-[9/16] overflow-hidden rounded-xl bg-card text-foreground" onClick={() => void choose(target)} aria-label={`Open dance ${index() + 1}`}>
            <img class="h-full w-full object-cover" src={(playback.posterPath ?? videoPosterPath)(target.reference_post_id)} alt="" loading="lazy" />
            <span class="absolute inset-x-0 bottom-0 bg-black/70 p-2 text-sm text-white">Dance {index() + 1} · {target.body_duration_ms / 1000} s</span>
          </button>
        }</For></div>
      </Show>
      <Show when={value.options.next_cursor}><Button variant="secondary" disabled={busy()} onClick={() => void more()}>More dances</Button></Show>
      <Show when={selected()} keyed>{target => <section class="fixed inset-0 z-30 flex flex-col overflow-y-auto bg-black text-white" aria-label="Selected dance">
        <div class="absolute inset-0"><VideoPlayer postId={target.reference_post_id} state={{ playback: "ready", thumbnail: "ready" }} activation="manual" layout="card" /></div>
        <div class="pointer-events-none relative z-10 flex min-h-dvh flex-col justify-between p-4">
          <IconButton class="pointer-events-auto size-11 bg-black/70" aria-label="Back to dances" variant="secondary" onClick={back}><IconArrowLeft /></IconButton>
          <div class="pointer-events-auto mx-auto flex w-full max-w-md flex-col gap-3 rounded-xl bg-black/80 p-4">
            <Type as="h2" variant="h3" class="text-white">Dance</Type><p>{target.body_duration_ms / 1000} seconds</p>
            <Show when={busy()}><p aria-busy="true">Checking your recording…</p></Show>
            <Show when={detail()} keyed>{entry => <>
              <Show when={entry.latest?.state === "withdrawn" ? null : entry.latest} keyed>{latest =>
                <a class="rounded-lg border border-white/30 p-3 underline" href={danceReviewPending(latest) || latest.state === "uploaded" ? danceReviewPath(props.communityId, latest.review_id) : danceResultPath(props.communityId, latest.review_id)}>{danceResultPresentation(latest).title}</a>
              }</Show>
              <Show when={value.owner} fallback={<>
                <Button variant="secondary" disabled={busy() || entry.fixedPersonaId !== null} onClick={() => setProfileOpen(true)}>{profileLabel()}</Button>
                <Show when={!value.options.ready || !value.options.policy}><p>Recording isn’t available for this dance right now.</p></Show>
                <Show when={!(entry.latest && danceReviewPending(entry.latest!))}><Button disabled={busy() || !personaId() || !value.options.ready || !value.options.policy} onClick={() => void begin()}>Do this dance</Button></Show>
            </>}><p>You review recordings for this community.</p><a class="underline" href={danceOwnerPath(props.communityId)}>Review recordings</a></Show>
            </>}</Show>
            <Show when={message()}><p role="alert">{message()}</p><Button variant="secondary" disabled={busy()} onClick={() => void choose(target)}>Check dance</Button></Show>
          </div>
        </div>
      </section>}</Show>
      <Show when={!selected() && message()}><p role="alert">{message()}</p></Show>
      <CommunityPersonaChoiceDialog label="Dancing as" open={profileOpen()} onOpenChange={setProfileOpen}
        personas={profiles().length > 0 ? profiles() : value.session.personas.filter(persona => persona.communityBinding === null)}
        choice={personaId() ? { kind: "existing", personaId: personaId()! } : undefined} onChoose={choice => void chooseProfile(choice)} allowCreateNew={profiles().length === 0} />
      </Show>
      <Show when={recording()} keyed>{scope => <DanceRecorderPanel scope={scope} policyHash={value.options.policy!.policy_hash} profileLabel={profileLabel()} api={api!}
        recorder={seams.recorder} store={seams.store} reviewApi={seams.reviewApi} session={seams.session} onBack={() => { setRecording(null); const target = selected(); if (target) void choose(target); }} />}</Show>
    </>}</Show>
  </div>;
}

export function DanceSongRoute() {
  const params = useParams();
  return <Show when={params.communityId} keyed>{communityId => <Show when={params.postId} keyed>{postId => <DanceSongPage communityId={communityId} postId={postId} />}</Show>}</Show>;
}
