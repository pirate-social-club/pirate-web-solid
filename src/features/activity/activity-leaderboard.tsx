import { ApiClientError } from "@pirate/api-client";
import { isServer } from "@solidjs/web";
import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { onSessionCleared, onSessionRefreshed, resolveSession, type SessionResolution } from "../../api/session.ts";
import { Avatar, Button, Type } from "../../design-system.ts";
import { OperationPersonaControl } from "../identity/operation-persona-control/operation-persona-control.tsx";
import { communityOperationPersonas, toOperationPersonas } from "../identity/community-persona-choice.ts";
import { readActivityLeaderboard, setActivityPresentation, type ActivityClient, type ActivityLeaderboardData, type ActivityScope } from "./activity-api.ts";
import { ActivityProgress } from "./activity-progress.tsx";
import { readPrivateProgress, readPresentation, type ActivityProgressData, type ActivityPresentationData, type PrivateActivityClient } from "./activity-private-api.ts";
import { ActivityRequirements } from "./activity-requirements.tsx";

export interface ActivityLeaderboardDependencies {
  readonly client?: ActivityClient;
  readonly privateClient?: PrivateActivityClient;
  readonly resolveSession?: () => Promise<SessionResolution>;
}
type Entry = ActivityLeaderboardData["entries"][number];
type LoadState = "loading" | "ready" | "error" | "session-error" | "restricted";
interface PendingPresentation { readonly accountId: string; readonly scope: ActivityScope; readonly personaId: string; readonly key: string }
const label = (entry: Entry) => entry.persona.display_name || entry.persona.primary_public_handle || "Community profile";

/** Only server-ranked public personas enter the list. Private standing stays separate. */
export function ActivityLeaderboard(props: ActivityScope & { readonly compact?: boolean; readonly dependencies?: ActivityLeaderboardDependencies }) {
  const [state, setState] = createSignal<LoadState>("loading");
  const [data, setData] = createSignal<ActivityLeaderboardData>();
  const [viewer, setViewer] = createSignal<SessionResolution>();
  const [saving, setSaving] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [expanded, setExpanded] = createSignal(false);
  const [progress, setProgress] = createSignal<ActivityProgressData>();
  const [presentation, setPresentation] = createSignal<ActivityPresentationData>();
  const [privateState, setPrivateState] = createSignal<"loading" | "ready" | "error">("loading");
  const [presentationState, setPresentationState] = createSignal<"loading" | "ready" | "error">("loading");
  const [pendingChoice, setPendingChoice] = createSignal<PendingPresentation>();
  const showDetails = () => !props.compact || expanded();
  let generation = 0;
  let disposed = false;
  let readController: AbortController | undefined;
  let writeController: AbortController | undefined;
  let readTimeout: ReturnType<typeof setTimeout> | undefined;
  let writeTimeout: ReturnType<typeof setTimeout> | undefined;
  const scope = (): ActivityScope => ({ communityId: props.communityId, postId: props.postId });
  const sameScope = (target: ActivityScope) => target.communityId === props.communityId && target.postId === props.postId;
  const visibleData = () => {
    const result = data();
    return result && result.scope.community_id === props.communityId && (props.postId
      ? result.scope.kind === "song" && result.scope.post_id === props.postId
      : result.scope.kind === "community") ? result : undefined;
  };
  const invalidate = () => {
    // Aborting a transport cannot undo a command the server may have accepted.
    // Keep its identity until session reconciliation or an authoritative ACK.
    ++generation; readController?.abort(); writeController?.abort();
    clearTimeout(readTimeout); clearTimeout(writeTimeout);
    setData(undefined); setProgress(undefined); setPresentation(undefined); setPrivateState("loading"); setPresentationState("loading"); setViewer(undefined); setSaving(false); setMessage(""); setState("loading");
  };
  const load = async (sessionOverride?: "anonymous") => {
    invalidate();
    const revision = generation;
    const target = scope();
    if (pendingChoice() && !sameScope(pendingChoice()!.scope)) setPendingChoice(undefined);
    const controller = new AbortController(); readController = controller;
    const current = () => !disposed && revision === generation && sameScope(target) && !controller.signal.aborted;
    const timer = setTimeout(() => { if (current()) { controller.abort(); if (state() === "loading") setState("error"); if (privateState() === "loading") setPrivateState("error"); if (presentationState() === "loading") setPresentationState("error"); } }, 15_000);
    readTimeout = timer;
    try {
      let session: SessionResolution;
      try { session = sessionOverride ?? await (props.dependencies?.resolveSession ?? resolveSession)(); }
      catch { if (current()) setState("session-error"); return; }
      if (!current()) return;
      const pending = pendingChoice();
      if (pending && (session === "anonymous" || session.userId !== pending.accountId)) setPendingChoice(undefined);
      else if (pending) setMessage("Couldn't confirm the profile change. Try the same profile again to check it.");
      setViewer(session);
      const publicRead = readActivityLeaderboard(target, session !== "anonymous", controller.signal, props.dependencies?.client)
        .then(result => { if (current()) { setData(result); setState("ready"); } }, error => {
          if (current()) setState(error instanceof ApiClientError && (error.status === 401 || error.status === 403) ? "restricted" : "error");
        });
      const privateReads = session === "anonymous" ? [] : [
        readPrivateProgress(target, controller.signal, props.dependencies?.privateClient).then(result => { if (current()) { setProgress(result); setPrivateState("ready"); } }, () => { if (current()) setPrivateState("error"); }),
        readPresentation(target, controller.signal, props.dependencies?.privateClient).then(result => {
          if (!current()) return;
          const selection = result.selection;
          if (selection.status === "selected" && !session.personasUnavailable && !communityOperationPersonas(session.personas, target.communityId).some(persona => persona.personaId === selection.presentation.persona_id)) { setPresentationState("error"); return; }
          setPresentation(result); setPresentationState("ready");
          // A current GET selection never acknowledges an uncertain PUT key.
        }, () => { if (current()) setPresentationState("error"); }),
      ];
      await Promise.allSettled([publicRead, ...privateReads]);
    } catch (error) {
      if (current()) setState(error instanceof ApiClientError && (error.status === 401 || error.status === 403) ? "restricted" : "error");
    } finally { clearTimeout(timer); }
  };
  const authenticated = () => { const session = viewer(); return session && session !== "anonymous" ? session : undefined; };
  const candidates = () => communityOperationPersonas(authenticated()?.personas ?? [], props.communityId);
  const currentProgress = () => { const value = progress(); return value && value.scope.community_id === props.communityId && (props.postId ? value.scope.kind === "song" && value.scope.post_id === props.postId : value.scope.kind === "community") ? value : undefined; };
  const selectedPersona = () => { const value = presentation(); return value?.community_id === props.communityId && value.selection.status === "selected" ? value.selection.presentation.persona_id : undefined; };
  const selectPersona = async (personaId: string) => {
    const session = authenticated();
    if (saving() || !session) return;
    const pending = pendingChoice();
    if (pending && pending.personaId !== personaId) {
      setMessage("Confirm the previous profile change by choosing that profile again first."); return;
    }
    // A replay names the already-issued command even if a profile read failed
    // or its candidate disappeared; the server must resolve that exact key.
    if (!pending && !candidates().some(persona => persona.personaId === personaId)) return;
    const command = pending ?? { accountId: session.userId, scope: scope(), personaId, key: `activity-presentation:${crypto.randomUUID()}` };
    if (command.accountId !== session.userId || !sameScope(command.scope)) return;
    setPendingChoice(command);
    const revision = generation;
    const account = session.userId;
    const target = scope();
    const controller = new AbortController(); writeController = controller;
    setSaving(true); setMessage("");
    const current = () => !disposed && revision === generation && pendingChoice() === command && sameScope(target) && !controller.signal.aborted;
    const timer = setTimeout(() => { if (current()) { controller.abort(); setSaving(false); setMessage("Couldn't confirm the profile change. Try the same profile again to check it."); } }, 15_000);
    writeTimeout = timer;
    try {
      const result = await setActivityPresentation(target, personaId, command.key, controller.signal, props.dependencies?.client);
      if (!current()) return;
      if (result.community_id !== target.communityId || result.persona_id !== personaId) throw new Error("activity_presentation_mismatch");
      setPendingChoice(undefined);
      // Read back the server's new presentation and standings. Never optimistically
      // rewrite a public row or infer a rank from a successful persona command.
      await load();
      if (!disposed && generation === revision + 1 && sameScope(target) && authenticated()?.userId === account) {
        setMessage("Presenting profile saved.");
      }
    } catch {
      if (current()) setMessage("Couldn't confirm the profile change. Try the same profile again to check it.");
    } finally { clearTimeout(timer); if (current()) setSaving(false); }
  };
  createEffect(() => [props.communityId, props.postId] as const, () => {
    const revision = ++generation;
    readController?.abort(); writeController?.abort();
    if (!isServer) queueMicrotask(() => { if (!disposed && revision === generation) void load(); });
  });
  if (!isServer) {
    let clearing = false;
    onCleanup(onSessionRefreshed(() => { if (!clearing) void load(); }));
    onCleanup(onSessionCleared(() => {
      clearing = true;
      setPendingChoice(undefined);
      // A clear is sufficient authority for a public read, even if the session
      // resolver or a following refresh notification has not caught up.
      void load("anonymous");
      queueMicrotask(() => { clearing = false; });
    }));
  }
  onCleanup(() => { disposed = true; ++generation; readController?.abort(); writeController?.abort(); clearTimeout(readTimeout); clearTimeout(writeTimeout); });
  return <section aria-label={props.postId ? "Song streak leaderboard" : "Community streak leaderboard"} class="min-w-0 space-y-4 rounded-xl border border-border-soft p-4" data-activity-leaderboard>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <Type as="h2" variant="h3">{props.postId ? "Song streaks" : "Community streaks"}</Type>
      <Show when={props.compact}><Button variant="secondary" aria-expanded={expanded() ? "true" : "false"} onClick={() => setExpanded(value => !value)}>{expanded() ? "Hide leaderboard" : "Leaderboard"}</Button></Show>
    </div>
    <Show when={props.compact && currentProgress()}>{entry => <p>Your streak: {entry().streak.current} days</p>}</Show>
    <Show when={!showDetails() && state() === "loading"}><p role="status">Loading streaks…</p></Show>
    <Show when={!showDetails() && state() !== "loading" && state() !== "ready"}><p role="alert">Streak summary unavailable. Open the leaderboard to retry.</p></Show>
    <Show when={showDetails()}>
    <Type as="p" variant="caption" class="text-muted-foreground">Qualifying Study and Karaoke activity counts toward streaks. Days follow each account’s pinned timezone.</Type>
        <Show when={authenticated()} fallback={<Show when={viewer() === "anonymous"}><p>Sign in to see your private standing and choose your presenting profile.</p></Show>}>
          <div class="space-y-3" data-private-activity-standing>
            <Type as="h3" variant="body-strong">Your standing</Type>
            <Show when={privateState() !== "loading"} fallback={<p role="status">Loading your progress…</p>}>
              <Show when={currentProgress()} fallback={<p role="alert">Your progress is unavailable.</p>}>{value => <ActivityProgress progress={value()} />}</Show>
              <Show when={privateState() === "error"}><Button variant="secondary" onClick={() => { void load(); }}>Retry progress</Button></Show>
            </Show>
            <Show when={presentationState() === "loading"}><p role="status">Loading presenting profile…</p></Show>
            <Show when={presentationState() === "error" || presentation()?.selection.status === "unavailable"}><p>Presenting profile is unavailable.</p><Button variant="secondary" onClick={() => { void load(); }}>Retry presenting profile</Button></Show>
            <Show when={authenticated()?.personasUnavailable}><p>Profiles couldn't be loaded. Retry before changing your presenting profile.</p><Button variant="secondary" onClick={() => { void load(); }}>Retry profiles</Button></Show>
            <Show when={candidates().length > 1}>
              <OperationPersonaControl label="Presenting as" placeholder="Choose profile" personas={toOperationPersonas(candidates())} selectedPersonaId={selectedPersona()} disabled={saving()} onSelect={id => { void selectPersona(id); }} />
              <p class="text-sm text-muted-foreground">This profile presents your song, community and Karaoke standings in this community.</p>
            </Show>
            <Show when={candidates().length === 1 && (presentation()?.selection.status === "unset" || presentation()?.selection.status === "unavailable") ? candidates()[0] : undefined}>{persona => <>
              <Button variant="secondary" disabled={saving()} onClick={() => { void selectPersona(persona().personaId); }}>Use {persona().displayName || persona().primaryPublicHandle || "Community profile"} as presenting profile</Button>
              <p class="text-sm text-muted-foreground">This profile presents your song, community and Karaoke standings in this community.</p>
            </>}</Show>
            <Show when={saving()}><p role="status">Saving presenting profile…</p></Show>
            <Show when={message()}><p role="status">{message()}</p></Show>
            <Show when={!saving() ? pendingChoice() : undefined}>{pending => <Button variant="secondary" onClick={() => { void selectPersona(pending().personaId); }}>Retry profile change</Button>}</Show>
          </div>
        </Show>
    <Show when={state() !== "loading"} fallback={<p role="status">Loading streaks…</p>}>
      <Show when={state() === "ready"} fallback={<div class="space-y-3">
        <p role="alert">{state() === "session-error" ? "Couldn't check your session. Retry to load streaks." : state() === "restricted" ? "Streaks aren't available with this session. Sign in again or check access." : "Couldn't load streaks."}</p>
        <Button variant="secondary" onClick={() => { void load(); }}>Try again</Button>
      </div>}>
        <Show when={(visibleData()?.entries.length ?? 0) > 0} fallback={<p>No active streaks yet.</p>}>
          <ol class="space-y-3" aria-label="Streak standings">
            <For each={visibleData()?.entries}>{entry => <li class="flex min-w-0 items-center gap-3">
              <span class="w-8 shrink-0 tabular-nums" aria-label={`Rank ${entry.rank}`}>{entry.rank}</span>
              <Avatar fallback={label(entry)} src={entry.persona.avatar_ref ?? undefined} class="size-9 shrink-0" />
              <span class="min-w-0 flex-1 truncate">{label(entry)}<Show when={authenticated() && entry.is_viewer}> (You)</Show></span>
              <span class="shrink-0 tabular-nums">{entry.current} days</span>
            </li>}</For>
          </ol>
        </Show>
        <Show when={authenticated()}><ActivityRequirements client={props.dependencies?.client} /></Show>
      </Show>
    </Show>
    </Show>
  </section>;
}
