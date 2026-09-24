import { IconButton, IconPause, IconPlay, Type } from "../../../design-system";
import { PostComposerField } from "./fields";
import {
  type ExcerptBounds,
  excerptLengthMs,
  formatExcerptTime,
  slideWindow,
  windowStartMax,
} from "./song-excerpt";

/** Chooses where the song starts in a song-backed video.
 *
 * One window, dragged as a whole. Before a clip exists it is as long as a
 * video may be; the finished clip then shortens it from the same start, so the
 * author only ever chooses the start.
 */
export function PostComposerExcerptSelector(props: {
  bounds: ExcerptBounds;
  onChange: (bounds: ExcerptBounds) => void;
  onTogglePreview: () => void;
  readonly playing: boolean;
  readonly positionMs: number;
  readonly songDurationMs: number;
}) {
  const length = () => excerptLengthMs(props.bounds);
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
  const start = () => formatExcerptTime(props.bounds.startMs);

  return (
    <PostComposerField
      counter={<output class="tabular-nums">{start()}</output>}
      label="Song starts at"
      tone="muted"
    >
      <div class="rounded-[var(--radius-xl)] bg-card p-3">
        <div class="mb-3 flex items-center gap-3">
          <IconButton
            active={props.playing}
            aria-label={props.playing ? "Pause the song" : "Play from here"}
            class="size-9 shrink-0 rounded-full border-0 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={props.onTogglePreview}
          >
            {props.playing ? <IconPause class="size-4" /> : <IconPlay class="size-4" filled />}
          </IconButton>
          <Type as="span" variant="caption" class="flex-1 text-muted-foreground">
            Up to 15 seconds, as long as your video
          </Type>
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
            Drag to choose where the song starts
          </Type>
          <input
            aria-label="Where the song starts"
            aria-valuetext={`Starts at ${start()}, plays ${timeRange()}`}
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
