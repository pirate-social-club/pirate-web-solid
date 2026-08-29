import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import {
  Button,
  IconArrowCounterClockwise,
  IconMicrophoneStage,
  Spinner,
  Type,
} from "../../design-system";
import { ActivityProgressHeader } from "../activity/activity-progress-header";
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
  onExit?: () => void;
  onStartSinging?: (songMs: number) => void;
  singingStatus?: "idle" | "requesting-mic" | "connecting" | "reconnecting" | "active" | "finishing" | "ended" | "error";
  onTimeChange?: (songMs: number) => void;
  /** Internal playback lifecycle notifications for scoring; no visible controls. */
  onPlay?: (songMs: number) => void;
  onPause?: (songMs: number) => void;
  onSeek?: (songMs: number) => void;
  onFinish?: (songMs: number) => void;
}

interface AudioElementRef {
  current?: HTMLAudioElement;
}

export function KaraokePracticeSurface(props: KaraokePracticeSurfaceProps) {
  const audioRef: AudioElementRef = {};
  const [currentTimeMs, setCurrentTimeMs] = createSignal(0);
  const [durationMs, setDurationMs] = createSignal(getLyricDurationMs(props.lines));
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(Boolean(props.instrumentalAudioUrl));
  let pendingPlay = false;
  const firstLineStartMs = props.lines[0]?.startMs ?? Number.POSITIVE_INFINITY;
  const ended = () => props.singingStatus === "ended";

  const syncTime = () => {
    const songMs = (audioRef.current?.currentTime ?? 0) * 1000;
    setCurrentTimeMs(songMs);
    props.onTimeChange?.(songMs);
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
        if (singingStatus === "idle" || singingStatus === "ended" || singingStatus === "error") pendingPlay = false;
        return;
      }
      if (!pendingPlay) return;
      pendingPlay = false;
      const audio = audioRef.current;
      if (audio && !isPlaying()) void audio.play().catch(() => setIsPlaying(false));
    },
  );
  onCleanup(() => audioRef.current?.pause());

  return (
    <section aria-label={props.title} class="flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground">
      <ActivityProgressHeader
        exitLabel="Exit karaoke"
        onExit={props.onExit}
        progressMax={durationMs()}
        progressValue={currentTimeMs()}
        rewardLabel={props.rewardLabel}
      />
      <div class="relative min-h-0 flex-1 overflow-hidden">
        <Show when={props.artworkSrc}>
          <img alt="" aria-hidden="true" class="pointer-events-none absolute inset-0 size-full scale-110 object-cover opacity-20 blur-2xl" src={props.artworkSrc} />
          <div aria-hidden="true" class="absolute inset-0 bg-gradient-to-b from-background/50 via-background/70 to-background" />
        </Show>
        <div class="relative z-10 size-full">
          <Show when={!isLoading()} fallback={<div class="grid size-full place-items-center"><Spinner class="size-8" /></div>}>
            <Show
              when={props.lines.length > 0}
              fallback={<div aria-live="polite" class="grid size-full place-items-center px-6 text-center"><Type as="p" variant="body">No timed lyrics</Type></div>}
            >
              <KaraokeLyricStage
                currentTimeMs={currentTimeMs()}
                lines={props.lines}
                primed={!isPlaying() && currentTimeMs() <= firstLineStartMs}
                rating={props.rating}
              />
            </Show>
          </Show>
        </div>
      </div>
      <footer class="border-t border-border-soft bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 backdrop-blur-xl sm:px-6">
        <audio
          ref={(element) => { audioRef.current = element; }}
          preload="metadata"
          src={props.instrumentalAudioUrl}
          onCanPlay={() => setIsLoading(false)}
          onDurationChange={(event) => {
            const nextDurationMs = event.currentTarget.duration * 1000;
            if (Number.isFinite(nextDurationMs) && nextDurationMs > 0) {
              setDurationMs(Math.round(nextDurationMs));
            }
          }}
          onEnded={() => { setIsPlaying(false); syncTime(); props.onFinish?.(currentTimeMs()); }}
          onError={() => setIsLoading(false)}
          onPause={() => { setIsPlaying(false); props.onPause?.(currentTimeMs()); }}
          onPlay={() => { setIsPlaying(true); props.onPlay?.(currentTimeMs()); }}
          onTimeUpdate={syncTime}
        />
        <div class="mx-auto w-full max-w-3xl">
          <Show when={props.onStartSinging}>
            <Button
              class="h-13 w-full"
              disabled={props.singingStatus === "active" || props.singingStatus === "requesting-mic" || props.singingStatus === "connecting" || props.singingStatus === "reconnecting"}
              leadingIcon={ended() ? <IconArrowCounterClockwise class="size-5" /> : <IconMicrophoneStage class="size-5" />}
              loading={props.singingStatus === "requesting-mic" || props.singingStatus === "connecting" || props.singingStatus === "reconnecting"}
              onClick={() => { pendingPlay = true; props.onStartSinging?.(currentTimeMs()); }}
            >
              {props.singingStatus === "active" ? "Listening" : ended() ? "Karaoke again" : "Start karaoke"}
            </Button>
          </Show>
        </div>
      </footer>
    </section>
  );
}
