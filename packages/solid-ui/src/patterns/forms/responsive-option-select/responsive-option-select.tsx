import type { JSX } from "@solidjs/web";
import { createSignal, For, Show } from "solid-js";

import { Button } from "@/components/actions/button/button";
import { pillButtonVariants } from "@/components/actions/pill-button/pill-button";
import { Select } from "@/components/forms/select/select";
import { Type } from "@/components/data-display/type/type";
import { IconCaretDown, IconCheck } from "@/components/media/icons";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/overlays/sheet/sheet";
import { cn } from "@/lib/cn";

export interface ResponsiveOptionSelectOption {
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
  icon?: JSX.Element;
  label: string;
  value: string;
}

export interface ResponsiveOptionSelectProps {
  ariaLabel: string;
  class?: string;
  drawerTitle: string;
  mobileTriggerContent?: JSX.Element;
  name?: string;
  onValueChange?: (value: string) => void;
  options: readonly ResponsiveOptionSelectOption[];
  placeholder?: string;
  selectAlign?: "start" | "center" | "end";
  size?: "default" | "lg";
  triggerContent?: JSX.Element;
  triggerClass?: string;
  value?: string;
}

function OptionDetail(props: { option: ResponsiveOptionSelectOption }) {
  return (
    <span class="flex min-w-0 items-center gap-3 text-start">
      {props.option.icon ? <span class="shrink-0">{props.option.icon}</span> : null}
      <span class="min-w-0 space-y-0.5">
        <span class="block truncate">{props.option.label}</span>
        {props.option.description ? (
          <Type as="span" variant="caption" class="block whitespace-normal">
            {props.option.description}
          </Type>
        ) : null}
        {props.option.disabled && props.option.disabledReason ? (
          <Type as="span" variant="caption" class="block whitespace-normal text-warning">
            {props.option.disabledReason}
          </Type>
        ) : null}
      </span>
    </span>
  );
}

/**
 * Responsive option picker: a bottom sheet of full-width option buttons on
 * small viewports and a pill-styled select popup on md and up. Fully
 * data-driven — options carry label, description, icon, and disabled reason;
 * selection is reported through onValueChange. The host controls the value.
 *
 * Custom mobile triggers are rendered as the SheetTrigger's child, so they
 * must be content-only or a single interactive control; the wrapper does not
 * add pill styling or triggerClass to custom content.
 */
export function ResponsiveOptionSelect(props: ResponsiveOptionSelectProps) {
  const [drawerOpen, setDrawerOpen] = createSignal(false);

  const activeOption = () =>
    props.options.find((option) => option.value === props.value);
  const activeLabel = () =>
    activeOption()?.label ?? props.placeholder ?? props.value ?? "";
  const triggerSizeClass = () => (props.size === "lg" ? "h-12" : "h-11");
  const placement = () =>
    props.selectAlign === "start"
      ? "bottom-start"
      : props.selectAlign === "center"
        ? "bottom"
        : "bottom-end";

  const handleChange = (nextValue: string) => {
    props.onValueChange?.(nextValue);
    setDrawerOpen(false);
  };

  return (
    <Show when={props.options.length > 0}>
      <div class={cn("flex w-full", props.class)}>
        <div class="w-full md:hidden">
          <Sheet open={drawerOpen()} onOpenChange={setDrawerOpen}>
            <Show
              when={props.mobileTriggerContent}
              fallback={
                <SheetTrigger
                  aria-label={props.ariaLabel}
                  class={cn(
                    pillButtonVariants({ tone: "default" }),
                    triggerSizeClass(),
                    "w-full max-w-none cursor-pointer gap-1.5 px-4",
                    props.triggerClass,
                  )}
                >
                  {props.triggerContent ?? <span class="truncate">{activeLabel()}</span>}
                  <IconCaretDown class="size-4 shrink-0" />
                </SheetTrigger>
              }
            >
              {(customTrigger) => (
                <SheetTrigger as="span" role="presentation" tabindex={-1}>
                  {customTrigger()}
                </SheetTrigger>
              )}
            </Show>
            <SheetContent
              class="max-h-[75dvh] rounded-t-[var(--radius-3xl)] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4"
              side="bottom"
            >
              <div class="mx-auto mb-4 h-1 w-12 rounded-full bg-muted" aria-hidden="true" />
              <SheetHeader class="pe-12 text-start">
                <SheetTitle>{props.drawerTitle}</SheetTitle>
              </SheetHeader>
              <div aria-label={props.drawerTitle} class="mt-5 grid gap-3" role="group">
                <For each={props.options}>
                  {(option) => (
                    <Button
                      class="h-auto min-h-14 w-full justify-between px-4 py-3"
                      aria-pressed={option.value === props.value ? "true" : "false"}
                      disabled={option.disabled}
                      onClick={() => handleChange(option.value)}
                      trailingIcon={
                        option.value === props.value ? (
                          <IconCheck class="size-5 shrink-0" />
                        ) : null
                      }
                      variant={option.value === props.value ? "default" : "secondary"}
                    >
                      <OptionDetail option={option} />
                    </Button>
                  )}
                </For>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <div class="hidden md:block">
          <Select
            aria-label={props.ariaLabel}
            name={props.name}
            onChange={(value) => value && handleChange(value)}
            optionDisabled={(option) => Boolean(option.disabled)}
            optionLabel={(option) => option.label}
            optionValue={(option) => option.value}
            options={[...props.options]}
            placement={placement()}
            placeholder={props.placeholder ? <span>{props.placeholder}</span> : undefined}
            renderOption={(option) => <OptionDetail option={option} />}
            renderValue={(option) => props.triggerContent ?? (option ? <span class="truncate">{option.label}</span> : <span class="truncate">{props.placeholder}</span>)}
            triggerClass={cn(
              pillButtonVariants({ tone: "default" }),
              triggerSizeClass(),
              "w-auto min-w-32 justify-between gap-2 bg-card py-0 pe-3 ps-4 shadow-none",
              props.triggerClass,
            )}
            value={props.value}
          />
        </div>
      </div>
    </Show>
  );
}
