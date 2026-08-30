import { createEffect, createMemo, createSignal, Show } from "solid-js";
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
import { requestGlobalSignIn } from "../auth/global-sign-in-host";

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
}

function LoadedKaraokeSession(props: { payload: ApiSongKaraokePayload; postId: string; client: KaraokeApiClient }) {
  const navigate = useNavigate();
  const lines = createMemo(() => payloadLines(props.payload));
  const scorableLines = createMemo(() => toScorableKaraokeLines(lines()));
  const communityId = props.payload.community ?? "";
  const scoring = useKaraokeScoring({
    communityId,
    createKaraokeSession: (community, postId, idempotencyKey, signal) => props.client.createSession({ communityId: community, idempotencyKey, postId, signal }),
    enabled: Boolean(communityId && scorableLines().length > 0),
    postId: props.postId,
    scorableLines: scorableLines(),
  });
  const [authError, setAuthError] = createSignal(false);

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
          onExit={() => navigate(`/p/${encodeURIComponent(props.postId)}`)}
          title="Sign in to sing"
        />
      }
    >
      <Title>{props.payload.title ? `${props.payload.title} · Karaoke` : "Karaoke"}</Title>
      <KaraokePracticeSurface
        artworkSrc={props.payload.artwork_src ?? undefined}
        instrumentalAudioUrl={props.payload.instrumental_audio_url ?? undefined}
        lines={lines()}
        onExit={() => navigate(`/p/${encodeURIComponent(props.postId)}`)}
        onFinish={(songMs) => scoring.controls.noteFinish(songMs)}
        onPause={(songMs) => scoring.controls.notePause(songMs)}
        onPlay={(songMs) => scoring.controls.notePlay(songMs)}
        onSeek={(songMs) => scoring.controls.noteSeek(songMs)}
        onStartSinging={communityId && scorableLines().length > 0 ? (songMs) => {
          setAuthError(false);
          scoring.controls.start(songMs);
        } : undefined}
        onTimeChange={(songMs) => scoring.controls.noteTime(songMs)}
        rating={feedback().rating}
        singingStatus={scoringState()?.status ?? "idle"}
        title={props.payload.title ?? "Karaoke"}
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
      {(loaded) => <LoadedKaraokeSession client={client} payload={loaded()} postId={props.postId} />}
    </Show>
  );
}

export interface KaraokeLeaderboardRouteViewProps {
  postId: string;
  client?: KaraokeApiClient;
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
              onExit={() => navigate(`/p/${encodeURIComponent(props.postId)}/karaoke`)}
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
              onExit={() => navigate(`/p/${encodeURIComponent(props.postId)}/karaoke`)}
              onSing={() => navigate(`/p/${encodeURIComponent(props.postId)}/karaoke`)}
              title={value.payload.title ?? "Karaoke"}
            />
          </>
        );
      }}
    </Show>
  );
}
