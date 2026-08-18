import type { JSX } from "@solidjs/web";
import { createMemo, omit } from "solid-js";
import { Show } from "solid-js";

import { RadioIndicator } from "@/components/forms/radio-indicator/radio-indicator";
import { cn } from "@/lib/cn";
import { cva, type VariantProps } from "@/lib/recipe";

export const optionCardVariants = cva(
  "w-full cursor-pointer rounded-[var(--radius-lg)] border p-4 text-start transition-[border-color,background-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        default: "border-border-soft bg-background text-foreground hover:border-border",
        selected: "border-primary bg-primary-subtle text-foreground",
        disabled:
          "cursor-not-allowed border-border-soft bg-muted/30 opacity-60 text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface OptionCardProps
  extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "class">,
    VariantProps<typeof optionCardVariants> {
  class?: string;
  title: string;
  description?: string;
  selected?: boolean;
  icon?: JSX.Element;
  disabledHint?: string;
}

/**
 * OptionCard - a single-choice card button with a RadioIndicator, title,
 * description, and optional leading icon. Used inside forms as a friendly
 * alternative to a bare RadioGroup; the host owns selection state. Do not
 * use it for multi-select (that is a CheckboxCard).
 */
export function OptionCard(props: OptionCardProps) {
  const className = createMemo(() => {
    const variant = props.disabled
      ? "disabled"
      : props.selected
        ? "selected"
        : (props.variant ?? "default");
    return cn(optionCardVariants({ variant }), props.class);
  });
  const rest = omit(
    props,
    "class",
    "variant",
    "title",
    "description",
    "selected",
    "icon",
    "disabledHint",
  );

  const indicator = <RadioIndicator checked={props.selected ?? false} />;

  return (
    <button {...rest} type={props.type ?? "button"} class={className()}>
      <div class="flex items-center gap-3">
        <Show when={props.icon} fallback={indicator}>
          <span class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card">
            {props.icon}
          </span>
        </Show>
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
        <Show when={props.icon}>{indicator}</Show>
      </div>
    </button>
  );
}
