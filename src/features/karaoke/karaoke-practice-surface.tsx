import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import {
  Button,
  IconArrowCounterClockwise,
  IconMicrophoneStage,
  Spinner,
} from "../../design-system";
import { ActivityProgressHeader } from "../activity/activity-progress-header";
import { ActivityResults } from "../activity/activity-results";
import { karaokeResultsView, type KaraokeResultsSummary } from "./karaoke-results-model";
import { getLyricDurationMs } from "./karaoke-timing";
import { KaraokeLyricStage } from "./karaoke-lyric-stage";
import type { KaraokeLineRating, KaraokeStageLine } from "./karaoke-lyric-stage";

export interface KaraokePracticeSurfaceProps {
  title: string;
  artworkSrc?: string;
  instrumentalAudioUrl?: string;
  lines: readonly KaraokeStageLine[];
  rewardLabel?: string;
  rating?: KaraokeLineRating | null;
  /** Seeds an offline/story render at a known point in the lyric timeline. */
  initialTimeMs?: number;
  /** Seeds the progress scale for deterministic story renders without audio. */
  initialDurationMs?: number;
  /** Keeps scoring feedback visible in deterministic story renders. */
  ratingPersistent?: boolean;
  onExit?: () => void;
  onStartSinging?: (songMs: number) => void;
  singingStatus?: "idle" | "requesting-mic" | "connecting" | "reconnecting" | "active" | "finishing" | "ended" | "error";
  onTimeChange?: (songMs: number) => void;
  /** Internal playback lifecycle notifications for scoring; no visible controls. */
  onPlaybackElement?: (element: HTMLAudioElement | null) => void;
  playbackInterrupted?: boolean;
  onResumePlayback?: () => Promise<boolean>;
  onPlay?: (songMs: number) => void;
  onPause?: (songMs: number) => void;
  onSeek?: (songMs: number) => void;
  onFinish?: (songMs: number) => void;
  /** The server's summary for the finished take; null when none arrived. */
  summary?: KaraokeResultsSummary | null;
  /** Longest run of well-sung lines, from the client's live feedback. */
  bestCombo?: number;
}

interface AudioElementRef {
  current?: HTMLAudioElement;
}

export function KaraokePracticeSurface(props: KaraokePracticeSurfaceProps) {
  const audioRef: AudioElementRef = {};
  const [currentTimeMs, setCurrentTimeMs] = createSignal(Math.max(0, props.initialTimeMs ?? 0));
  const [durationMs, setDurationMs] = createSignal(props.initialDurationMs ?? getLyricDurationMs(props.lines));
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(Boolean(props.instrumentalAudioUrl));
  let pendingPlay = false;
  let disposed = false;
  let playRequest = 0;
  const [playbackIssue, setPlaybackIssue] = createSignal(false);
  const [resuming, setResuming] = createSignal(false);
  let recoveryRequest = 0;
  const resumeInterruptedPlayback = () => {
    const request = ++recoveryRequest;
    setResuming(true);
    // Invoke synchronously from the click; awaiting first loses user activation.
    const resume = props.onResumePlayback?.() ?? Promise.resolve(false);
    void resume.then((running) => {
      if (disposed || request !== recoveryRequest || props.singingStatus !== "active") return;
      setResuming(false);
      if (running) playBackingTrack();
    }, () => {
      if (!disposed && request === recoveryRequest) setResuming(false);
    });
  };
  const playBackingTrack = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const request = ++playRequest;
    setPlaybackIssue(false);
    void audio.play().catch(() => {
      if (disposed || request !== playRequest || props.singingStatus !== "active") return;
      setIsPlaying(false);
      setPlaybackIssue(true);
      props.onPause?.(currentTimeMs());
    });
  };
  const firstLineStartMs = props.lines[0]?.startMs ?? Number.POSITIVE_INFINITY;
  const ended = () => props.singingStatus === "ended";
  const busy = () => props.singingStatus === "requesting-mic" || props.singingStatus === "connecting" || props.singingStatus === "reconnecting";

  const syncTime = () => {
    const songMs = (audioRef.current?.currentTime ?? 0) * 1000;
    setCurrentTimeMs(songMs);
    props.onTimeChange?.(songMs);
    return songMs;
  };
  createEffect(
    () => props.instrumentalAudioUrl,
    (instrumentalAudioUrl) => {
      if (!instrumentalAudioUrl) setIsLoading(false);
    },
  );
  createEffect(
    () => props.singingStatus,
    (singingStatus) => {
      if (singingStatus !== "active") {
        recoveryRequest += 1;
        setResuming(false);
        if (singingStatus === "idle" || singingStatus === "ended" || singingStatus === "error") {
          pendingPlay = false;
          playRequest += 1;
          audioRef.current?.pause();
        }
        return;
      }
      if (!pendingPlay) return;
      pendingPlay = false;
      const audio = audioRef.current;
      if (audio && !isPlaying()) playBackingTrack();
    },
  );
  let clockTimer: ReturnType<typeof setInterval> | undefined;
  createEffect(() => props.singingStatus, (status) => {
    clearInterval(clockTimer);
    clockTimer = status === "active" ? setInterval(syncTime, 50) : undefined;
  });
  createEffect(() => props.playbackInterrupted, (interrupted) => {
    if (!interrupted) return;
    playRequest += 1;
    setPlaybackIssue(false);
    setIsPlaying(false);
  });
  onCleanup(() => { clearInterval(clockTimer); props.onPlaybackElement?.(null); disposed = true; playRequest += 1; audioRef.current?.pause(); });

  return (
    <section aria-label={props.title} class="flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground">
      <h1 class="sr-only">{props.title}</h1>
      {/* A finished take needs no exit arrow or progress bar; Continue leaves. */}
      <Show when={!ended()}>
      <ActivityProgressHeader
        exitLabel="Exit karaoke"
        onExit={props.onExit}
        progressMax={durationMs()}
        progressValue={currentTimeMs()}
        rewardLabel={props.rewardLabel}
      />
      </Show>
      <div class="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <Show when={props.artworkSrc}>
          <img alt="" aria-hidden="true" class="pointer-events-none absolute inset-0 size-full scale-110 object-cover opacity-20 blur-2xl" src={props.artworkSrc} />
          <div aria-hidden="true" class="absolute inset-0 bg-gradient-to-b from-background/50 via-background/70 to-background" />
        </Show>
        <div class="relative z-10 size-full min-w-0">
          <Show when={ended()}>
            {(_) => {
              const view = () => karaokeResultsView(props.summary ?? null, props.bestCombo ?? 0);
              return (
                // A scrollable region must be reachable by keyboard.
                <div aria-label="Results" class="flex size-full overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" role="region" tabindex="0">
                  <ActivityResults
                    heading={view().heading}
                    note={view().note}
                    scoreLabel="Score"
                    scorePercent={view().scorePercent}
                    stats={view().stats}
                  />
                </div>
              );
            }}
          </Show>
          <Show when={!ended() && !isLoading()} fallback={<Show when={!ended()}><div class="grid size-full place-items-center"><Spinner class="size-8" /></div></Show>}>
            <Show
              when={props.lines.length > 0}
            >
              <KaraokeLyricStage
                currentTimeMs={currentTimeMs()}
                lines={props.lines}
                primed={!isPlaying() && currentTimeMs() <= firstLineStartMs}
                rating={props.rating}
                ratingPersistent={props.ratingPersistent}
              />
            </Show>
          </Show>
        </div>
      </div>
      <audio
        ref={(element) => { audioRef.current = element; props.onPlaybackElement?.(element); }}
        crossorigin="anonymous"
        preload="auto"
        src={props.instrumentalAudioUrl}
        onCanPlay={() => setIsLoading(false)}
        onDurationChange={(event) => {
          const nextDurationMs = event.currentTarget.duration * 1000;
          if (Number.isFinite(nextDurationMs) && nextDurationMs > 0) {
            setDurationMs(Math.round(nextDurationMs));
          }
        }}
        onEnded={() => { setIsPlaying(false); props.onFinish?.(syncTime()); }}
        onError={() => setIsLoading(false)}
        onPause={() => { setIsPlaying(false); props.onPause?.(syncTime()); }}
        onPlay={() => setIsPlaying(true)}
        onPlaying={() => { setIsPlaying(true); props.onPlay?.(syncTime()); }}
        onWaiting={() => { props.onPause?.(syncTime()); }}
        onStalled={(event) => {
          const songMs = syncTime();
          // A stalled download can leave enough buffered audio to keep playing.
          if (event.currentTarget.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) props.onPause?.(songMs);
        }}
        onTimeUpdate={syncTime}
      />
      <Show when={props.playbackInterrupted && props.singingStatus === "active"}>
        <footer class="border-t border-border-soft bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4">
          <p role="status" class="mb-3 text-center text-sm text-muted-foreground">Audio was interrupted. Tap to continue your take.</p>
          <Button class="h-13 w-full" disabled={resuming()} loading={resuming()} onClick={resumeInterruptedPlayback}>Tap to continue</Button>
        </footer>
      </Show>
      <Show when={playbackIssue() && !props.playbackInterrupted && props.singingStatus === "active"}>
        <footer class="border-t border-border-soft bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4">
          <p role="status" class="mb-3 text-center text-sm text-muted-foreground">The backing track could not start. Press play to continue.</p>
          <Button class="h-13 w-full" onClick={playBackingTrack}>Start backing track</Button>
        </footer>
      </Show>
      <Show when={props.onStartSinging && props.singingStatus !== "active"}>
        <footer class="border-t border-border-soft bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4 backdrop-blur-xl sm:px-6">
          {/* Results: "Sing again" and Continue side by side, Continue on the right. */}
          <div class={ended() && props.onExit ? "mx-auto grid w-full max-w-3xl grid-cols-2 gap-3" : "mx-auto grid w-full max-w-3xl gap-3"}>
            <Button
              class="h-13 w-full"
              disabled={busy()}
              leadingIcon={ended() ? <IconArrowCounterClockwise class="size-5" /> : <IconMicrophoneStage class="size-5" />}
              loading={busy()}
              onClick={() => {
                pendingPlay = true;
                if (!ended()) { props.onStartSinging?.(currentTimeMs()); return; }
                // A finished take leaves the track at its end; another take starts from the top.
                if (audioRef.current) audioRef.current.currentTime = 0;
                setCurrentTimeMs(0);
                props.onStartSinging?.(0);
              }}
              variant={ended() && props.onExit ? "secondary" : "default"}
            >
              {ended() ? "Sing again" : busy() ? "Start singing" : "Start karaoke"}
            </Button>
            <Show when={ended() && props.onExit}>
              <Button class="h-13 w-full" onClick={props.onExit} size="lg">Continue</Button>
            </Show>
          </div>
        </footer>
      </Show>
    </section>
  );
}
