import { createMemo } from "solid-js";
import { Show } from "solid-js";

import { Checkbox } from "@/components/forms/checkbox/checkbox";
import { cn } from "@/lib/cn";

export interface CheckboxCardProps {
  class?: string;
  title: string;
  description?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  disabledHint?: string;
}

/**
 * CheckboxCard - a selectable card row: one Checkbox plus title, description,
 * and optional disabled hint. The whole card is a label for the checkbox
 * input, so every click toggles and the keyboard interaction is native. Use
 * it for multi-select lists; do not use it for mutually exclusive choices
 * (that is a RadioGroup or OptionCard).
 */
export function CheckboxCard(props: CheckboxCardProps) {
  const className = createMemo(() =>
    cn(
      "flex w-full cursor-pointer items-start gap-3 rounded-[var(--radius-lg)] border p-4 text-start transition-[border-color,background-color]",
      props.checked
        ? "border-primary bg-primary-subtle"
        : "border-border-soft bg-background hover:border-primary/40",
      props.disabled && "cursor-not-allowed border-border-soft bg-muted/30 opacity-60",
      props.class,
    ),
  );

  return (
    <label class={className()} data-disabled={props.disabled ? "" : undefined}>
      <Checkbox
        aria-label={props.title}
        checked={props.checked}
        disabled={props.disabled}
        onChange={(next) => props.onCheckedChange?.(next === true)}
      />
      <div class="min-w-0 flex-1 space-y-1">
        <p
          class={cn(
            "text-base font-semibold leading-tight",
            props.disabled && "text-muted-foreground",
          )}
        >
          {props.title}
        </p>
        <Show when={props.description}>
          <p class="text-base leading-6 text-muted-foreground">
            {props.description}
          </p>
        </Show>
        <Show when={props.disabled && props.disabledHint}>
          <p class="text-base leading-6 text-warning">{props.disabledHint}</p>
        </Show>
      </div>
    </label>
  );
}
