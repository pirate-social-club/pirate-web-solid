import { For } from "solid-js";

import { Type } from "@/components/data-display/type/type";
import { IconCaretLeft, IconCaretRight } from "@/components/media/icons";
import { cn } from "@/lib/cn";

export interface StackedSectionNavItem {
  active?: boolean;
  description?: string;
  label: string;
  onSelect?: () => void;
}

export interface StackedSectionNavSection {
  items: StackedSectionNavItem[];
  label: string;
}

export interface StackedSectionNavProps {
  class?: string;
  isRtl?: boolean;
  mobileLayout?: boolean;
  sections: StackedSectionNavSection[];
}

export function StackedSectionNav(props: StackedSectionNavProps) {
  return (
    <div class={cn("w-full space-y-6", props.class)}>
      <For each={props.sections}>
        {(section) => (
          <section class={cn(props.mobileLayout ? "w-full space-y-2" : "space-y-2")}>
            {section.label ? (
              <Type as="div" class={cn("text-muted-foreground/55", props.mobileLayout ? "px-4" : "px-1")} variant="overline">
                {section.label}
              </Type>
            ) : null}
            <div class={cn(
              "w-full overflow-hidden",
              props.mobileLayout ? "border-b border-border-soft" : "rounded-[var(--radius-2xl)] border border-border-soft bg-card",
            )}>
              <For each={section.items}>
                {(item, index) => (
                  <button
                    aria-current={item.active ? "page" : undefined}
                    class={cn(
                      "flex w-full items-center justify-between gap-4 text-start transition-colors hover:bg-muted/30",
                      props.mobileLayout ? "p-4" : "px-5 py-4",
                      item.active && "bg-muted/30 text-foreground",
                      index() < section.items.length - 1 ? "border-b border-border-soft" : undefined,
                    )}
                    onClick={() => item.onSelect?.()}
                    type="button"
                  >
                    <span class="flex min-w-0 flex-col items-start gap-0.5">
                      <Type as="span" variant="label">{item.label}</Type>
                      {item.description ? <Type as="span" class="text-muted-foreground" variant="caption">{item.description}</Type> : null}
                    </span>
                    {props.isRtl ? <IconCaretLeft class="size-5 shrink-0 text-muted-foreground" /> : <IconCaretRight class="size-5 shrink-0 text-muted-foreground" />}
                  </button>
                )}
              </For>
            </div>
          </section>
        )}
      </For>
    </div>
  );
}
