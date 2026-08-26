import type { JSX } from "@solidjs/web";
import { createMemo, omit, Show } from "solid-js";

import { Type } from "@/components/data-display/type/type";
import { cn } from "@/lib/cn";
import { cva, type VariantProps } from "@/lib/recipe";

export const listRowVariants = cva(
  "flex min-h-16 w-full items-center gap-3 rounded-[var(--radius-lg)] border px-4 py-3 text-start",
  {
    variants: {
      tone: {
        default: "border-border-soft bg-card text-foreground",
        selected: "border-primary bg-primary-subtle text-foreground",
        muted: "border-border-soft bg-muted/30 text-muted-foreground",
      },
      interactive: {
        true: "cursor-pointer transition-[border-color,background-color] hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        false: "",
      },
    },
    defaultVariants: {
      tone: "default",
      interactive: false,
    },
  },
);

export interface ListRowProps
  extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "class" | "title">,
    Omit<VariantProps<typeof listRowVariants>, "interactive"> {
  class?: string;
  /** Leading slot: an icon, avatar, or drag handle. */
  leading?: JSX.Element;
  title: JSX.Element;
  description?: JSX.Element;
  /** Trailing slot: a chevron, value, status glyph, or control. */
  trailing?: JSX.Element;
  /**
   * Element rendered when the row is not a button. Defaults to div; pass "li"
   * inside a list.
   */
  as?: "div" | "li";
}

/**
 * ListRow - the one row surface shared by gate lists, composer attachments and
 * settings, reward activities, and booking lists: a leading slot, a title with
 * optional description, and a trailing slot. Passing onClick renders a real
 * button; otherwise the row is inert and renders as a div or li, so a
 * non-interactive row never borrows a control's affordance. For selection use
 * OptionCard (single) or CheckboxCard (multiple) instead.
 */
export function ListRow(props: ListRowProps) {
  const interactive = () => Boolean(props.onClick);
  const className = createMemo(() =>
    cn(
      listRowVariants({ tone: props.tone, interactive: interactive() }),
      props.class,
    ),
  );
  const rest = omit(
    props,
    "class",
    "tone",
    "leading",
    "title",
    "description",
    "trailing",
    "as",
  );

  const body = (
    <>
      <Show when={props.leading}>
        {(leading) => <span class="flex shrink-0 items-center">{leading()}</span>}
      </Show>
      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
        <Type as="span" variant="body-strong">
          {props.title}
        </Type>
        <Show when={props.description}>
          {(description) => (
            <Type as="span" variant="caption">
              {description()}
            </Type>
          )}
        </Show>
      </span>
      <Show when={props.trailing}>
        {(trailing) => <span class="shrink-0">{trailing()}</span>}
      </Show>
    </>
  );

  return (
    <Show
      when={interactive()}
      fallback={
        <Show
          when={props.as === "li"}
          fallback={<div class={className()}>{body}</div>}
        >
          <li class={className()}>{body}</li>
        </Show>
      }
    >
      <button {...rest} type={props.type ?? "button"} class={className()}>
        {body}
      </button>
    </Show>
  );
}
