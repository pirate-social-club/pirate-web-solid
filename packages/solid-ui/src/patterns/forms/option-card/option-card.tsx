import { RadioGroup as KRadioGroup } from "@kobalte/core/radio-group";
import type { JSX } from "@solidjs/web";
import { createMemo, type ParentProps } from "solid-js";
import { Show } from "solid-js";

import { cn } from "@/lib/cn";
import { cva } from "@/lib/recipe";

export const optionCardVariants = cva(
  [
    "flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border p-4 text-start transition-[border-color,background-color]",
    "border-border-soft bg-background text-foreground hover:border-border",
    "group-data-checked:border-primary group-data-checked:bg-primary-subtle",
    "group-data-disabled:cursor-not-allowed group-data-disabled:border-border-soft group-data-disabled:bg-muted/30 group-data-disabled:text-muted-foreground group-data-disabled:opacity-60",
    "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
  ].join(" "),
);

const indicatorClass = cn(
  "relative size-6 shrink-0 rounded-full border-2 border-border bg-transparent transition-colors",
  "group-data-checked:border-primary",
  "group-data-checked:after:absolute group-data-checked:after:left-1/2 group-data-checked:after:top-1/2",
  "group-data-checked:after:size-3 group-data-checked:after:-translate-x-1/2 group-data-checked:after:-translate-y-1/2",
  "group-data-checked:after:rounded-full group-data-checked:after:bg-primary group-data-checked:after:content-['']",
);

export interface OptionCardProps {
  class?: string;
  /** Identifies this choice within its OptionCardGroup. */
  value: string;
  title: string;
  description?: string;
  icon?: JSX.Element;
  disabled?: boolean;
  disabledHint?: string;
}

/**
 * OptionCard - one choice inside an OptionCardGroup, drawn as a card with a
 * selection dot, title, description, and optional leading icon.
 *
 * It composes Kobalte's RadioGroup item, so the group is a single tab stop,
 * arrow keys move and change the selection, and the checked state comes from a
 * real native radio rather than hand-written ARIA. Selection is owned by the
 * group's value, not by this card. Use it for a friendly alternative to a bare
 * RadioGroup; for multi-select use CheckboxCard.
 */
export function OptionCard(props: OptionCardProps) {
  const className = createMemo(() => cn("group relative", props.class));
  const indicator = <span aria-hidden="true" class={indicatorClass} />;

  return (
    <KRadioGroup.Item class={className()} disabled={props.disabled} value={props.value}>
      <KRadioGroup.ItemInput class="peer" />
      <KRadioGroup.ItemLabel class={optionCardVariants()}>
        <Show when={props.icon} fallback={indicator}>
          <span class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card">
            {props.icon}
          </span>
        </Show>
        <span class="min-w-0 flex-1 space-y-1">
          <span
            class={cn(
              "block text-base font-semibold leading-tight",
              props.disabled && "text-muted-foreground",
            )}
          >
            {props.title}
          </span>
          <Show when={props.description}>
            <span class="block text-base leading-6 text-muted-foreground">
              {props.description}
            </span>
          </Show>
          <Show when={props.disabled && props.disabledHint}>
            <span class="block text-base leading-6 text-warning">{props.disabledHint}</span>
          </Show>
        </span>
        <Show when={props.icon}>{indicator}</Show>
      </KRadioGroup.ItemLabel>
    </KRadioGroup.Item>
  );
}

export interface OptionCardGroupProps {
  class?: string;
  /** Accessible name for the group; omit when labelledBy is supplied. */
  label?: string;
  /** Id of the visible heading or legend naming the group. */
  labelledBy?: string;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}

/**
 * OptionCardGroup - the radiogroup that owns a set of OptionCards and the
 * selected value. It carries the group's accessible name so each option is
 * announced as "n of m" with its checked state.
 */
export function OptionCardGroup(props: ParentProps<OptionCardGroupProps>) {
  const className = createMemo(() => cn("flex flex-col gap-2", props.class));

  return (
    <KRadioGroup
      aria-label={props.label}
      aria-labelledby={props.labelledBy}
      class={className()}
      disabled={props.disabled}
      onChange={props.onChange}
      required={props.required}
      value={props.value}
    >
      {props.children}
    </KRadioGroup>
  );
}
