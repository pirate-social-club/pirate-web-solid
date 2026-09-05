import { createEffect, createMemo, createSignal, onCleanup, untrack, Show } from "solid-js";
import { isServer } from "@solidjs/web";
import { useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { KaraokePracticeSurface } from "./karaoke-practice-surface";
import { KaraokeLeaderboard } from "./karaoke-leaderboard";
import {
  KaraokeAuthRequiredState,
  KaraokeRouteLoadFailureState,
  KaraokeRouteLoadingState,
} from "./karaoke-route-states";
import { createKaraokeApiClient, type ApiSongKaraokePayload, type KaraokeApiClient } from "./karaoke-api";
import { isKaraokeAuthError, loadKaraokeLeaderboard, loadKaraokePayload, type LoadedKaraokeLeaderboard } from "./karaoke-route-model";
import { toScorableKaraokeLines } from "./karaoke-stage-bridge";
import { toKaraokeStageLines } from "./lyric-transform";
import { deriveKaraokeFeedback } from "./karaoke-scoring-feedback";
import { useKaraokeScoring } from "./scoring/use-karaoke-scoring-session";
import type { RawKaraokeLine } from "./lyric-transform";
import { preloadGlobalSignInAssets, prepareGlobalSignIn, requestGlobalSignIn } from "../auth/global-sign-in-host";
import { resolveSession, onSessionRefreshed, type SessionResolution } from "../../api/session";
import { communityOperationPersonas, defaultOperationPersonaId } from "../identity/community-persona-choice";
import { CommunityPersonaChoiceDialog } from "../identity/community-persona-choice-sheet";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function isRawKaraokeLine(value: unknown): value is RawKaraokeLine {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function payloadLines(payload: ApiSongKaraokePayload) {
  const rawLines = payload.karaoke_lines ?? (payload.raw_lines ?? []).filter(isRawKaraokeLine);
  return toKaraokeStageLines(rawLines);
}

export interface KaraokeSessionRouteViewProps {
  postId: string;
  client?: KaraokeApiClient;
  exitPath?: string;
  resolveSession?: () => Promise<SessionResolution>;
  createScoring?: typeof useKaraokeScoring;
}

function LoadedKaraokeSession(props: { payload: ApiSongKaraokePayload; postId: string; client: KaraokeApiClient; exitPath?: string; resolveSession?: () => Promise<SessionResolution>; createScoring?: typeof useKaraokeScoring }) {
  const navigate = useNavigate();
  const lines = createMemo(() => payloadLines(props.payload));
  const scorableLines = createMemo(() => toScorableKaraokeLines(lines()));
  const communityId = props.payload.community ?? "";
  const [session, setSession] = createSignal<SessionResolution>();
  const [personaId, setPersonaId] = createSignal<string>();
  const [choiceOpen, setChoiceOpen] = createSignal(false);
  const [personaMessage, setPersonaMessage] = createSignal("");
  const [authError, setAuthError] = createSignal(false);
  let pendingSongMs = 0;
  let attemptPersonaId: string | undefined;
  let active = true;
  let sessionEpoch = 0;
  const eligible = () => {
    const current = session();
    return communityOperationPersonas(current && current !== "anonymous" ? current.personas : [], communityId);
  };
  const loadSession = async () => {
    const epoch = ++sessionEpoch;
    setSession(undefined);
    setPersonaId(undefined);
    setChoiceOpen(false);
    try {
      const resolved = await (props.resolveSession ?? resolveSession)();
      if (!active || epoch !== sessionEpoch) return;
      setSession(resolved);
      setPersonaId(resolved === "anonymous" ? undefined
        : defaultOperationPersonaId(communityOperationPersonas(resolved.personas, communityId)));
      setAuthError(false);
      setPersonaMessage("");
    } catch {
      if (active && epoch === sessionEpoch) setPersonaMessage("We couldn't load your community personas. Refresh to try again.");
    }
  };
  if (!isServer) queueMicrotask(() => { if (active) void loadSession(); });
  const unsubscribe = onSessionRefreshed(() => { void loadSession(); });
  onCleanup(() => { active = false; sessionEpoch += 1; unsubscribe(); });
  // The injected controller factory is fixed for this mounted session.
  const createScoring = untrack(() => props.createScoring) ?? useKaraokeScoring;
  const scoring = createScoring({
    communityId,
    createKaraokeSession: (community, postId, idempotencyKey, signal) => {
      const selected = attemptPersonaId;
      if (!selected || !eligible().some(persona => persona.personaId === selected)) {
        return Promise.reject(new Error("Choose a persona bound to this community before singing."));
      }
      return props.client.createSession({ communityId: community, personaId: selected, idempotencyKey, postId, signal });
    },
    enabled: Boolean(communityId && scorableLines().length > 0),
    postId: props.postId,
    scorableLines: scorableLines(),
  });

  createEffect(
    () => scoring.state(),
    (state) => {
      const error = state?.error;
      if (error?.code === "auth_error" || error?.code === "unauthorized") setAuthError(true);
    },
  );

  const scoringState = () => scoring.state();
  const feedback = () => deriveKaraokeFeedback(scoringState());

  return (
    <Show
      when={!authError()}
      fallback={
        <KaraokeAuthRequiredState
          ctaLabel="Sign in"
          description="This song is available to everyone, but recording a scored take requires an account."
          onConnect={requestGlobalSignIn}
          onConnectIntent={prepareGlobalSignIn}
          onConnectPreload={preloadGlobalSignInAssets}
          onExit={() => navigate(props.exitPath ?? "/")}
          title="Sign in to sing"
        />
      }
    >
      <Title>{props.payload.title ? `${props.payload.title} · Karaoke` : "Karaoke"}</Title>
      <KaraokePracticeSurface
        artworkSrc={props.payload.artwork_src ?? undefined}
        instrumentalAudioUrl={props.payload.instrumental_audio_url ?? undefined}
        lines={lines()}
        onExit={() => navigate(props.exitPath ?? "/")}
        onFinish={(songMs) => scoring.controls.noteFinish(songMs)}
        onPause={(songMs) => scoring.controls.notePause(songMs)}
        onPlay={(songMs) => scoring.controls.notePlay(songMs)}
        onSeek={(songMs) => scoring.controls.noteSeek(songMs)}
        onStartSinging={communityId && scorableLines().length > 0 ? (songMs) => {
          if (session() === undefined) {
            setPersonaMessage("Your community personas are still loading. Try again shortly.");
            return;
          }
          if (session() === "anonymous") { setAuthError(true); return; }
          if (eligible().length === 0) {
            setPersonaMessage("Join this community or create a persona there before singing a scored take.");
            return;
          }
          if (!eligible().some(persona => persona.personaId === personaId())) {
            pendingSongMs = songMs;
            setChoiceOpen(true);
            return;
          }
          setPersonaMessage("");
          attemptPersonaId = personaId();
          scoring.controls.start(songMs);
        } : undefined}
        onTimeChange={(songMs) => scoring.controls.noteTime(songMs)}
        rating={feedback().rating}
        singingStatus={scoringState()?.status ?? "idle"}
        title={props.payload.title ?? "Karaoke"}
      />
      <Show when={personaMessage()}><p role="status" class="fixed inset-x-4 bottom-24 z-50 rounded-lg bg-card p-4 text-center">{personaMessage()}</p></Show>
      <CommunityPersonaChoiceDialog
        label="Singing as" personas={eligible()} allowCreateNew={false}
        choice={personaId() ? { kind: "existing", personaId: personaId()! } : undefined}
        open={choiceOpen()} onOpenChange={setChoiceOpen}
        note="Choose the persona that presents this take in this community. Your private learning history stays with your account."
        onChoose={choice => {
          if (choice.kind !== "existing" || !eligible().some(persona => persona.personaId === choice.personaId)) return;
          setPersonaId(choice.personaId);
          attemptPersonaId = choice.personaId;
          setChoiceOpen(false);
          setPersonaMessage("");
          scoring.controls.start(pendingSongMs);
        }}
      />
    </Show>
  );
}

export function KaraokeSessionRouteView(props: KaraokeSessionRouteViewProps) {
  const client = props.client ?? createKaraokeApiClient();
  const [payload, setPayload] = createSignal<ApiSongKaraokePayload>();
  const [loadError, setLoadError] = createSignal<unknown>(null);
  const [loading, setLoading] = createSignal(true);
  const load = () => {
    setLoading(true);
    setLoadError(null);
    void loadKaraokePayload(client, props.postId).then(setPayload).catch(setLoadError).finally(() => setLoading(false));
  };
  if (typeof window !== "undefined") queueMicrotask(load);

  return (
      <Show when={payload()} fallback={<Show when={!loading()} fallback={<KaraokeRouteLoadingState label="Loading karaoke" />}><KaraokeRouteLoadFailureState description={errorMessage(loadError(), "We couldn't load karaoke for this song.")} onGoHome={() => { window.location.href = "/"; }} onRetry={load} title="Karaoke unavailable" /></Show>}>
      {(loaded) => <LoadedKaraokeSession client={client} exitPath={props.exitPath} payload={loaded()} postId={props.postId} resolveSession={props.resolveSession} createScoring={props.createScoring} />}
    </Show>
  );
}

export interface KaraokeLeaderboardRouteViewProps {
  postId: string;
  client?: KaraokeApiClient;
  karaokePath?: string;
}

export function KaraokeLeaderboardRouteView(props: KaraokeLeaderboardRouteViewProps) {
  const client = props.client ?? createKaraokeApiClient();
  const navigate = useNavigate();
  const [result, setResult] = createSignal<LoadedKaraokeLeaderboard>();
  const [loadedPayload, setLoadedPayload] = createSignal<ApiSongKaraokePayload>();
  const [loadError, setLoadError] = createSignal<unknown>(null);
  const [loading, setLoading] = createSignal(true);
  const load = () => {
    setLoading(true);
    setLoadError(null);
    void loadKaraokeLeaderboard(client, props.postId, undefined, setLoadedPayload)
      .then(setResult)
      .catch(setLoadError)
      .finally(() => setLoading(false));
  };
  if (typeof window !== "undefined") queueMicrotask(load);

  return (
    <Show
      when={result()}
      fallback={
        <Show
          when={!loading()}
          fallback={<KaraokeRouteLoadingState label="Loading karaoke leaderboard" />}
        >
          <Show
            when={isKaraokeAuthError(loadError())}
            fallback={<KaraokeRouteLoadFailureState description={errorMessage(loadError(), "We couldn't load the karaoke leaderboard.")} onGoHome={() => { window.location.href = "/"; }} onRetry={load} title="Leaderboard unavailable" />}
          >
            <KaraokeAuthRequiredState
              ctaLabel="Sign in"
              description="Karaoke scores are available to signed-in community members."
              leaderboard
              onConnect={requestGlobalSignIn}
              onConnectIntent={prepareGlobalSignIn}
              onConnectPreload={preloadGlobalSignInAssets}
              onExit={() => navigate(props.karaokePath ?? `/p/${encodeURIComponent(props.postId)}/karaoke`)}
              artistName={loadedPayload()?.artist_name ?? undefined}
              artworkSrc={loadedPayload()?.artwork_src ?? undefined}
              songTitle={loadedPayload()?.title ?? undefined}
              title="Sign in to view scores"
            />
          </Show>
        </Show>
      }
    >
      {(loaded) => {
        const value = loaded();
        return (
          <>
            <Title>{value.payload.title ? `${value.payload.title} · Scores` : "Karaoke scores"}</Title>
            <KaraokeLeaderboard
              artistName={value.payload.artist_name ?? undefined}
              artworkSrc={value.payload.artwork_src ?? undefined}
              leaderboard={value.leaderboard}
              onExit={() => navigate(props.karaokePath ?? `/p/${encodeURIComponent(props.postId)}/karaoke`)}
              onSing={() => navigate(props.karaokePath ?? `/p/${encodeURIComponent(props.postId)}/karaoke`)}
              title={value.payload.title ?? "Karaoke"}
            />
          </>
        );
      }}
    </Show>
  );
}
