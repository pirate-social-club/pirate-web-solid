import { IconButton, IconPause, IconPlay, Type } from "../../../design-system";
import { PostComposerField } from "./fields";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Selects the start of a fixed-duration audio preview and shows its full span. */
export function PostComposerPreviewSegmentSelector(props: {
  durationSeconds: number;
  onChange: (startSeconds: number) => void;
  onTogglePreview: () => void;
  playing: boolean;
  segmentSeconds?: number;
  startSeconds: number;
}) {
  const segmentSeconds = () => Math.min(props.segmentSeconds ?? 30, props.durationSeconds);
  const maxStart = () => Math.max(0, props.durationSeconds - segmentSeconds());
  const start = () => clamp(props.startSeconds, 0, maxStart());
  const end = () => start() + segmentSeconds();
  const segmentWidth = () => props.durationSeconds > 0
    ? segmentSeconds() / props.durationSeconds * 100
    : 100;
  const segmentOffset = () => maxStart() > 0
    ? start() / maxStart() * (100 - segmentWidth())
    : 0;
  const timeRange = () => `${formatTime(start())} – ${formatTime(end())}`;

  return (
    <PostComposerField
      counter={<output class="tabular-nums">{timeRange()}</output>}
      label="30-second preview"
      tone="muted"
    >
      <div class="rounded-[var(--radius-xl)] bg-card p-3">
        <div class="mb-3 flex items-center gap-3">
          <IconButton
            active={props.playing}
            aria-label={props.playing ? "Pause preview selection" : "Play preview selection"}
            class="size-9 shrink-0 rounded-full border-0 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={props.onTogglePreview}
          >
            {props.playing ? <IconPause class="size-4" /> : <IconPlay class="size-4" filled />}
          </IconButton>
          <Type as="span" variant="caption" class="flex-1">Preview selection</Type>
          <Type as="span" variant="caption" class="text-muted-foreground">{segmentSeconds()} sec</Type>
        </div>
        <div class="relative h-7 rounded-md outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-card">
          <div aria-hidden="true" class="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
          <div
            aria-hidden="true"
            class="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-primary shadow-sm"
            style={{ left: `${segmentOffset()}%`, width: `${segmentWidth()}%` }}
          />
          <input
            aria-label="Preview segment start"
            aria-valuetext={timeRange()}
            class="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            max={maxStart()}
            min="0"
            onInput={(event) => props.onChange(Number(event.currentTarget.value))}
            step="1"
            type="range"
            value={start()}
          />
        </div>
      </div>
    </PostComposerField>
  );
}
