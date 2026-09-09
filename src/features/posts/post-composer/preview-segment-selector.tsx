import { IconButton, IconPause, IconPlay, Type } from "../../../design-system";
import { PostComposerField } from "./fields";
import {
  type ExcerptBounds,
  excerptLengthMs,
  formatExcerptTime,
  MAX_EXCERPT_MS,
  MIN_EXCERPT_MS,
  moveExcerpt,
  resizeExcerptEnd,
  resizeExcerptStart,
} from "./song-excerpt";

/** Selects the excerpt of a song that a video is danced to.
 *
 * This was a start-only picker for a fixed thirty-second preview. Spec 021
 * section 3.2 has the author choose both bounds, with the excerpt running six
 * to thirty seconds, so a fixed span could not express one. It is generalized
 * here rather than duplicated: a second selector contradicting this one would
 * be worse than either.
 *
 * Three controls, deliberately separate and separately labelled, because the
 * failure this avoids is moving the start and having the end follow. The two
 * endpoints resize the excerpt; the position control slides the whole span at
 * its current length. Every change goes through the bounds module, so what the
 * view emits is always the integer milliseconds publication and extraction use.
 */
export function PostComposerExcerptSelector(props: {
  bounds: ExcerptBounds;
  label?: string;
  onChange: (bounds: ExcerptBounds) => void;
  onTogglePreview: () => void;
  playing: boolean;
  songDurationMs: number;
}) {
  const length = () => excerptLengthMs(props.bounds);
  const lengthSeconds = () => Math.round(length() / 1_000);
  const spanWidth = () =>
    props.songDurationMs > 0 ? (length() / props.songDurationMs) * 100 : 100;
  const spanOffset = () =>
    props.songDurationMs > 0 ? (props.bounds.startMs / props.songDurationMs) * 100 : 0;
  const timeRange = () =>
    `${formatExcerptTime(props.bounds.startMs)} – ${formatExcerptTime(props.bounds.endMs)}`;
  const latestStart = () => Math.max(0, props.songDurationMs - MIN_EXCERPT_MS);

  return (
    <PostComposerField
      counter={<output class="tabular-nums">{timeRange()}</output>}
      label={props.label ?? "Song excerpt"}
      tone="muted"
    >
      <div class="rounded-[var(--radius-xl)] bg-card p-3">
        <div class="mb-3 flex items-center gap-3">
          <IconButton
            active={props.playing}
            aria-label={props.playing ? "Pause excerpt preview" : "Play excerpt preview"}
            class="size-9 shrink-0 rounded-full border-0 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={props.onTogglePreview}
          >
            {props.playing ? <IconPause class="size-4" /> : <IconPlay class="size-4" filled />}
          </IconButton>
          <Type as="span" variant="caption" class="flex-1">
            Excerpt preview
          </Type>
          <Type as="span" variant="caption" class="text-muted-foreground tabular-nums">
            {lengthSeconds()} sec
          </Type>
        </div>

        <div class="relative mb-3 h-7 rounded-md">
          <div
            aria-hidden="true"
            class="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted"
          />
          <div
            aria-hidden="true"
            class="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-primary shadow-sm"
            style={{ left: `${spanOffset()}%`, width: `${spanWidth()}%` }}
          />
        </div>

        <div class="grid gap-2">
          <label class="grid gap-1">
            <Type as="span" variant="caption" class="text-muted-foreground">
              Start — resizes the excerpt, the end stays put
            </Type>
            <input
              aria-label="Excerpt start, resizes the excerpt without moving its end"
              aria-valuetext={`Starts at ${formatExcerptTime(props.bounds.startMs)}`}
              class="w-full"
              max={Math.max(0, props.bounds.endMs - MIN_EXCERPT_MS)}
              min={Math.max(0, props.bounds.endMs - MAX_EXCERPT_MS)}
              onInput={(event) =>
                props.onChange(
                  resizeExcerptStart(
                    props.bounds,
                    Number(event.currentTarget.value),
                    props.songDurationMs,
                  ),
                )}
              step="100"
              type="range"
              value={props.bounds.startMs}
            />
          </label>

          <label class="grid gap-1">
            <Type as="span" variant="caption" class="text-muted-foreground">
              End — resizes the excerpt, the start stays put
            </Type>
            <input
              aria-label="Excerpt end, resizes the excerpt without moving its start"
              aria-valuetext={`Ends at ${formatExcerptTime(props.bounds.endMs)}`}
              class="w-full"
              max={Math.min(props.songDurationMs, props.bounds.startMs + MAX_EXCERPT_MS)}
              min={props.bounds.startMs + MIN_EXCERPT_MS}
              onInput={(event) =>
                props.onChange(
                  resizeExcerptEnd(
                    props.bounds,
                    Number(event.currentTarget.value),
                    props.songDurationMs,
                  ),
                )}
              step="100"
              type="range"
              value={props.bounds.endMs}
            />
          </label>

          <label class="grid gap-1">
            <Type as="span" variant="caption" class="text-muted-foreground">
              Position — moves the whole excerpt, keeping its {lengthSeconds()} seconds
            </Type>
            <input
              aria-label="Excerpt position, moves the whole excerpt and keeps its length"
              aria-valuetext={`Excerpt ${timeRange()}`}
              class="w-full"
              max={latestStart()}
              min="0"
              onInput={(event) =>
                props.onChange(
                  moveExcerpt(props.bounds, Number(event.currentTarget.value), props.songDurationMs),
                )}
              step="100"
              type="range"
              value={props.bounds.startMs}
            />
          </label>
        </div>
      </div>
    </PostComposerField>
  );
}
