import { IconButton, IconPause, IconPlay, Type } from "../../../design-system";
import { PostComposerField } from "./fields";
import {
  type ExcerptBounds,
  excerptLengthMs,
  formatExcerptTime,
  slideWindow,
  windowStartMax,
} from "./song-excerpt";

/** Selects the part of a song a song-backed video plays.
 *
 * One window, dragged as a whole: its length is the length of the recording
 * that will carry it, so the two cannot drift apart. The earlier three-control
 * selector resized each endpoint and slid the span separately, and its position
 * control ran out of travel near the song's end, quietly clamping the excerpt
 * shorter. A fixed window stays whole; only its position moves.
 */
export function PostComposerExcerptSelector(props: {
  bounds: ExcerptBounds;
  readonly lengths: readonly number[];
  onChange: (bounds: ExcerptBounds) => void;
  onLengthChange: (lengthMs: number) => void;
  onTogglePreview: () => void;
  readonly playing: boolean;
  readonly positionMs: number;
  readonly songDurationMs: number;
}) {
  const length = () => excerptLengthMs(props.bounds);
  const lengthSeconds = () => Math.round(length() / 1_000);
  const spanWidth = () =>
    props.songDurationMs > 0 ? (length() / props.songDurationMs) * 100 : 100;
  const spanOffset = () =>
    props.songDurationMs > 0 ? (props.bounds.startMs / props.songDurationMs) * 100 : 0;
  const playheadOffset = () =>
    props.songDurationMs > 0
      ? Math.min(100, Math.max(0, (props.positionMs / props.songDurationMs) * 100))
      : 0;
  const timeRange = () =>
    `${formatExcerptTime(props.bounds.startMs)} – ${formatExcerptTime(props.bounds.endMs)}`;

  return (
    <PostComposerField
      counter={<output class="tabular-nums">{timeRange()}</output>}
      label="Song excerpt"
      tone="muted"
    >
      <div class="rounded-[var(--radius-xl)] bg-card p-3">
        <div class="mb-3 flex items-center gap-3">
          <IconButton
            active={props.playing}
            aria-label={props.playing ? "Pause the song excerpt" : "Play the song excerpt"}
            class="size-9 shrink-0 rounded-full border-0 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={props.onTogglePreview}
          >
            {props.playing ? <IconPause class="size-4" /> : <IconPlay class="size-4" filled />}
          </IconButton>
          <Type as="span" variant="caption" class="flex-1">
            {lengthSeconds()} second excerpt
          </Type>
          <div class="flex gap-1" role="group" aria-label="Excerpt length">
            {props.lengths.map(seconds => (
              <button
                aria-pressed={length() === seconds ? "true" : "false"}
                class={length() === seconds
                  ? "rounded-[var(--radius-lg)] border border-primary bg-primary px-2 py-1 text-xs tabular-nums text-primary-foreground"
                  : "rounded-[var(--radius-lg)] border border-border px-2 py-1 text-xs tabular-nums"}
                onClick={() => props.onLengthChange(seconds)}
                type="button"
              >
                {Math.round(seconds / 1_000)}s
              </button>
            ))}
          </div>
        </div>

        <div class="relative mb-3 h-7 rounded-md" data-excerpt-track>
          <div
            aria-hidden="true"
            class="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted"
          />
          <div
            aria-hidden="true"
            class="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-primary shadow-sm"
            data-excerpt-window
            style={{ left: `${spanOffset()}%`, width: `${spanWidth()}%` }}
          />
          <div
            aria-hidden="true"
            class="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-foreground"
            data-excerpt-playhead
            style={{ left: `${playheadOffset()}%` }}
          />
        </div>

        <label class="grid gap-1">
          <Type as="span" variant="caption" class="text-muted-foreground">
            Drag to move the excerpt through the song
          </Type>
          <input
            aria-label="Song position, moves the excerpt window"
            aria-valuetext={`Excerpt ${timeRange()}`}
            class="w-full"
            max={windowStartMax(length(), props.songDurationMs)}
            min="0"
            onInput={(event) =>
              props.onChange(slideWindow(props.bounds, Number(event.currentTarget.value), props.songDurationMs))
            }
            step="100"
            type="range"
            value={props.bounds.startMs}
          />
        </label>
      </div>
    </PostComposerField>
  );
}
