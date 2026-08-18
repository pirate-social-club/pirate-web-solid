import { Slider as KSlider } from "@kobalte/core/slider";
import {
  createMemo,
  createSignal,
  Show,
} from "solid-js";

import { typeVariants } from "@/components/data-display/type/type";
import { cn } from "@/lib/cn";

export interface ScrubberProps {
  value: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
  class?: string;
  showThumb?: boolean;
  showValueBubble?: boolean;
  ariaLabel?: string;
  /** Human-readable current value for assistive technology; overrides the default percentage label. */
  ariaValueText?: string;
  /** Bubble text shown while dragging or focused. */
  valueLabel?: string;
}

export function Scrubber(props: ScrubberProps) {
  const [isDragging, setIsDragging] = createSignal(false);
  const [isFocused, setIsFocused] = createSignal(false);
  const max = () => props.max ?? 100;
  const progressPercent = createMemo(() =>
    max() > 0 ? Math.min(100, Math.max(0, (props.value / max()) * 100)) : 0,
  );
  const bubbleVisible = createMemo(() =>
    Boolean(props.showValueBubble) && Boolean(props.valueLabel) && (isDragging() || isFocused()),
  );

  const className = createMemo(() =>
    cn(
      "group relative flex w-full cursor-pointer touch-none select-none items-center",
      props.disabled && "pointer-events-none cursor-default opacity-60",
      props.class,
    ),
  );

  return (
    <KSlider
      class={className()}
      disabled={props.disabled}
      maxValue={max()}
      onChange={(values) => props.onChange?.(values[0])}
      onPointerCancel={() => setIsDragging(false)}
      onPointerDown={() => setIsDragging(true)}
      onPointerUp={() => setIsDragging(false)}
      step={props.step ?? 1}
      value={[props.value]}
    >
      <KSlider.Track class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-border">
        <KSlider.Fill class="absolute h-full rounded-full bg-primary" />
      </KSlider.Track>
      <KSlider.Thumb
        aria-label={props.ariaLabel}
        aria-valuetext={props.ariaValueText}
        class={cn(
          "block size-3.5 rounded-full border border-background bg-primary shadow-sm",
          "transition-all duration-150 motion-reduce:transition-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "hover:scale-110",
          props.showThumb ? "" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        )}
        onBlur={() => setIsFocused(false)}
        onFocus={() => setIsFocused(true)}
      />
      <Show when={bubbleVisible()}>
        <span
          aria-hidden="true"
          class={cn(
            typeVariants({ variant: "label" }),
            "pointer-events-none absolute bottom-[calc(50%+0.75rem)] z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 tabular-nums text-background shadow-md",
          )}
          style={{ left: `clamp(2.25rem, ${progressPercent()}%, calc(100% - 2.25rem))` }}
        >
          {props.valueLabel}
        </span>
      </Show>
    </KSlider>
  );
}
