import { ApiClientError } from "@pirate/api-client";
import { isServer } from "@solidjs/web";
import { useParams } from "@solidjs/router";
import { createEffect, createSignal, onCleanup, Show, untrack } from "solid-js";
import { captureSessionAuthority } from "../../api/browser-session-events";
import { onSessionRefreshed, resolveSession, type AuthenticatedSession, type SessionResolution } from "../../api/session";
import { Button, buttonVariants, Type } from "../../design-system";
import { createCommunityProfileAttempt } from "../identity/community-profile-attempt";
import { communityOperationPersonas, type CommunityPersonaChoice } from "../identity/community-persona-choice";
import { CommunityPersonaChoiceDialog } from "../identity/community-persona-choice-sheet";
import { bindPrivatePageLifecycle } from "../notifications/private-page-lifecycle";
import { VideoPlayer } from "../posts/video-submission/video-player";
import { createBrowserDanceJournalStore, type DanceJournalStore } from "./dance-preparation-journal";
import { createDanceReferenceApi, danceReferencePath, type DanceReferenceApi } from "./dance-reference-api";
import { createDanceReferenceController, type DanceReferenceLocator, type DanceReferenceView } from "./dance-reference-controller";
import { danceSongPath } from "./dance-song-path";

type State = { readonly phase: "loading" | "anonymous" | "error" }
  | { readonly phase: "ready"; readonly session: AuthenticatedSession; readonly view: DanceReferenceView };

/** Existing public video -> exact song-community profile -> explicit Create.
 * Loading and progress checks use GETs. Explicit recovery replays only the
 * original command. This page records no new video and performs no money action. */
export function DanceReferencePage(props: {
  readonly referencePostId: string;
  readonly api?: DanceReferenceApi;
  readonly store?: DanceJournalStore;
  readonly session?: () => Promise<SessionResolution>;
  readonly prepareProfile?: ReturnType<typeof createCommunityProfileAttempt>;
}) {
  const seams = untrack(() => ({ api: props.api, store: props.store, session: props.session, prepareProfile: props.prepareProfile }));
  const [state, setState] = createSignal<State>({ phase: "loading" }, { ownedWrite: true });
  const [personaId, setPersonaId] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  const [profileOpen, setProfileOpen] = createSignal(false, { ownedWrite: true });
  const [busy, setBusy] = createSignal(false, { ownedWrite: true });
  let alive = true, generation = 0, request: AbortController | undefined, locator: DanceReferenceLocator | null = null;
  let controller: ReturnType<typeof createDanceReferenceController> | undefined;
  const ready = () => { const s = state(); return s.phase === "ready" ? s : undefined; };
  const draft = () => { const s = ready(); return s?.view.kind === "draft" ? s.view : undefined; };
  const profiles = () => { const s = ready(), target = draft(); return s && target ? communityOperationPersonas(s.session.personas, target.target.scope.communityId) : []; };
  const profileLabel = () => ready()?.session.personas.find(p => p.personaId === personaId())?.displayName
    ?? ready()?.session.personas.find(p => p.personaId === personaId())?.primaryPublicHandle ?? "Choose profile";
  const clear = () => { generation++; request?.abort(); locator = null; controller = undefined; setState({ phase: "loading" }); setPersonaId(undefined); setProfileOpen(false); setBusy(false); };
  const owns = (attempt: number, signal: AbortSignal, postId: string) => alive && generation === attempt && !signal.aborted && props.referencePostId === postId;
  const fail = (error: Error) => { setState({ phase: error instanceof ApiClientError && error.declaredName === "AuthError" ? "anonymous" : "error" }); setPersonaId(undefined); setProfileOpen(false); setBusy(false); };
  const apply = (session: AuthenticatedSession, view: DanceReferenceView) => {
    if (view.kind === "draft") { const choices = communityOperationPersonas(session.personas, view.target.scope.communityId); setPersonaId(choices.length === 1 ? choices[0]!.personaId : undefined); }
    else setPersonaId(undefined);
    setState({ phase: "ready", session, view }); setBusy(false);
  };
  const load = async () => {
    clear(); const attempt = generation, postId = props.referencePostId, pending = new AbortController(); request = pending;
    try {
      const session = await (seams.session ?? resolveSession)(); if (!owns(attempt, pending.signal, postId)) return;
      if (session === "anonymous") { setState({ phase: "anonymous" }); return; }
      const authority = captureSessionAuthority(); locator = { accountId: session.userId, referencePostId: postId };
      controller = createDanceReferenceController({ locator, currentLocator: () => locator, api: seams.api ?? createDanceReferenceApi(), store: seams.store ?? createBrowserDanceJournalStore() });
      const view = await controller.load(pending.signal); if (!owns(attempt, pending.signal, postId)) return;
      if (view.kind === "draft" && session.personasUnavailable) throw new Error("dance_reference_profiles_unavailable");
      if (captureSessionAuthority() !== authority) { clear(); setState({ phase: "error" }); return; }
      apply(session, view);
    } catch (error) { if (owns(attempt, pending.signal, postId)) fail(error instanceof Error ? error : new Error("dance_reference_unavailable")); }
  };
  const act = async (kind: "create" | "retry" | "status") => {
    const selected = ready(), writer = controller; if (!selected || !writer || busy()) return;
    const profile = personaId();
    if (kind === "create" && (selected.view.kind !== "draft" || !selected.view.target.playable || !profile || !profiles().some(p => p.personaId === profile))) return;
    generation++; request?.abort(); setState({ phase: "loading" }); setBusy(true); setProfileOpen(false);
    const attempt = generation, postId = props.referencePostId, authority = captureSessionAuthority(), pending = new AbortController(); request = pending;
    try {
      const view = kind === "create" && selected.view.kind === "draft" ? await writer.create(selected.view.target, profile!, pending.signal)
        : kind === "retry" ? await writer.retry(pending.signal) : await writer.load(pending.signal);
      if (!owns(attempt, pending.signal, postId)) return;
      if (captureSessionAuthority() !== authority) { clear(); setState({ phase: "error" }); return; }
      apply(selected.session, view);
    } catch (error) { if (owns(attempt, pending.signal, postId)) fail(error instanceof Error ? error : new Error("dance_reference_unavailable")); }
  };
  const chooseProfile = async (choice: CommunityPersonaChoice) => {
    setProfileOpen(false); const selected = ready(), target = draft(); if (!selected || !target || busy()) return;
    if (choice.kind === "existing" && profiles().some(p => p.personaId === choice.personaId)) { setPersonaId(choice.personaId); return; }
    const attempt = generation, postId = props.referencePostId, pending = request; if (!pending) return; setBusy(true);
    try {
      await (seams.prepareProfile ?? createCommunityProfileAttempt())({ session: selected.session, communityId: target.target.scope.communityId, choice, signal: pending.signal });
      if (owns(attempt, pending.signal, postId)) await load();
    } catch (error) { if (owns(attempt, pending.signal, postId)) fail(error instanceof Error ? error : new Error("dance_reference_unavailable")); }
    finally { if (owns(attempt, pending.signal, postId)) setBusy(false); }
  };
  createEffect(() => props.referencePostId, () => { clear(); const attempt = generation; if (!isServer) queueMicrotask(() => { if (alive && generation === attempt) void load(); }); });
  onCleanup(onSessionRefreshed(() => { void load(); }));
  onCleanup(bindPrivatePageLifecycle(clear));
  onCleanup(() => { alive = false; clear(); });
  return <main class="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-5 p-5" data-dance-reference={state().phase}>
    <Type as="h1" variant="h2">Create a dance</Type>
    <Show when={state().phase === "loading"}><p aria-busy="true">Checking your video…</p></Show>
    <Show when={state().phase === "anonymous"}><p>Sign in with the account that posted this video.</p><a class={buttonVariants({ variant: "secondary" })} href={`/auth/sign-in?return_to=${encodeURIComponent(danceReferencePath(props.referencePostId))}`}>Sign in</a></Show>
    <Show when={state().phase === "error"}><p role="alert">Your dance request couldn’t be checked.</p><Button variant="secondary" onClick={() => void load()}>Check again</Button></Show>
    <Show when={ready()} keyed>{selected => <>
      <a class="text-sm underline" href={`/post/${encodeURIComponent(props.referencePostId)}`}>Back to video</a>
      <Show when={selected.view.kind === "draft" ? selected.view : undefined} keyed>{view => <>
        <p>Use this video’s song excerpt for your dance.</p><Type as="h2" variant="h3">{view.target.songTitle}</Type>
        <div class="mx-auto aspect-[9/16] w-full max-w-xs overflow-hidden rounded-xl"><VideoPlayer postId={props.referencePostId} state={view.target.delivery} activation="manual" layout="card" /></div>
        <p>Dance videos are 6–30 seconds.</p>
        <Show when={!view.target.playable}><p role="status">Your video isn’t playable yet.</p><Button variant="secondary" onClick={() => void load()}>Check video</Button></Show>
        <Button variant="secondary" disabled={busy()} onClick={() => setProfileOpen(true)}>{profileLabel()}</Button>
        <Button disabled={busy() || !personaId() || !view.target.playable} onClick={() => void act("create")}>Create dance</Button>
        <CommunityPersonaChoiceDialog label="Creating as" open={profileOpen()} onOpenChange={setProfileOpen}
          personas={profiles().length > 0 ? profiles() : selected.session.personas.filter(p => p.communityBinding === null)}
          choice={personaId() ? { kind: "existing", personaId: personaId()! } : undefined} onChoose={choice => void chooseProfile(choice)} allowCreateNew={profiles().length === 0} />
      </>}</Show>
      <Show when={selected.view.kind === "needs_check"}><p>We couldn’t confirm whether your dance was created.</p><Button onClick={() => void act("retry")}>Check request</Button></Show>
      <Show when={selected.view.kind === "status" ? selected.view : undefined} keyed>{view => <>
        <Show when={view.reference.status === "ready"} fallback={<>
          <Show when={view.reference.status === "failed"} fallback={<><Type as="h2" variant="h3">Preparing your dance</Type><Button variant="secondary" onClick={() => void act("status")}>Check progress</Button></>}>
            <Type as="h2" variant="h3">This video couldn’t be prepared as a dance.</Type>
          </Show>
        </>}><Type as="h2" variant="h3">Your dance is prepared</Type><a class={buttonVariants({ variant: "default" })} href={danceSongPath(view.scope.communityId, view.scope.postId)}>View dances</a></Show>
      </>}</Show>
    </>}</Show>
  </main>;
}
export function DanceReferenceRoute() {
  const params = useParams(); return <Show when={params.referencePostId} keyed>{postId => <DanceReferencePage referencePostId={postId} />}</Show>;
}
