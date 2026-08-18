import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import {
  Button,
  IconCaretLeft,
  IconMusicNote,
  IconPause,
  IconPlay,
  MediaControlButton,
  Scrubber,
  Spinner,
  Type,
} from "../../design-system";
import { getLyricDurationMs } from "./karaoke-timing";
import { KaraokeLyricStage } from "./karaoke-lyric-stage";
import type { KaraokeStageLine } from "./lyric-transform";

export interface KaraokePracticeSurfaceProps {
  title: string;
  artistName?: string;
  artworkSrc?: string;
  instrumentalAudioUrl?: string;
  lines: readonly KaraokeStageLine[];
  onExit?: () => void;
}

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
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
  const firstLineStartMs = props.lines[0]?.startMs ?? Number.POSITIVE_INFINITY;

  const syncTime = () => setCurrentTimeMs((audioRef.current?.currentTime ?? 0) * 1000);
  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };
  const seek = (value: number) => {
    if (audioRef.current) audioRef.current.currentTime = value / 1000;
  };

  createEffect(() => {
    if (!props.instrumentalAudioUrl) setIsLoading(false);
  });
  onCleanup(() => audioRef.current?.pause());

  return (
    <section aria-label={props.title} class="flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground">
      <header class="flex items-center gap-3 border-b border-border-soft px-4 py-2.5 sm:px-6">
        <Button aria-label="Exit karaoke" leadingIcon={<IconCaretLeft class="size-5" />} onClick={props.onExit} size="icon" variant="ghost" />
        <div class="min-w-0 flex-1 text-center">
          <Type as="h1" class="truncate" variant="h3">{props.title}</Type>
          <Show when={props.artistName}><Type as="p" class="truncate" variant="caption">{props.artistName}</Type></Show>
        </div>
        <div class="size-10" />
      </header>
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
              />
            </Show>
          </Show>
        </div>
      </div>
      <footer class="border-t border-border-soft px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-4 sm:px-6">
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
          onEnded={() => { setIsPlaying(false); syncTime(); }}
          onError={() => setIsLoading(false)}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onTimeUpdate={syncTime}
        />
        <div class="mx-auto flex w-full max-w-2xl items-center gap-3">
          <MediaControlButton aria-label={isPlaying() ? "Pause" : "Play"} intent="default" onClick={togglePlayback} size="md">
            {isPlaying() ? <IconPause class="size-5" /> : <IconPlay class="size-5" />}
          </MediaControlButton>
          <div class="min-w-0 flex-1">
            <Scrubber ariaLabel="Karaoke playback position" ariaValueText={`${formatTime(currentTimeMs())} of ${formatTime(durationMs())}`} max={durationMs()} onChange={seek} value={currentTimeMs()} />
            <div class="mt-1 flex justify-between"><Type as="span" variant="caption">{formatTime(currentTimeMs())}</Type><Type as="span" variant="caption">{formatTime(durationMs())}</Type></div>
          </div>
          <IconMusicNote class="size-5 shrink-0 text-muted-foreground" />
        </div>
      </footer>
    </section>
  );
}
