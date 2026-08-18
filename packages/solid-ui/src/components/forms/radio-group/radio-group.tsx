import {
  RadioGroup as KRadioGroup,
  type RadioGroupDescriptionProps as KRadioGroupDescriptionProps,
  type RadioGroupErrorMessageProps as KRadioGroupErrorMessageProps,
  type RadioGroupItemProps as KRadioGroupItemProps,
  type RadioGroupLabelProps as KRadioGroupLabelProps,
  type RadioGroupRootProps,
} from "@kobalte/core/radio-group";
import { createMemo, omit, type ParentProps } from "solid-js";

import { cn } from "@/lib/cn";

export interface RadioGroupProps extends RadioGroupRootProps {
  class?: string;
  /** Accessible name for the group. */
  "aria-label"?: string;
}

/**
 * RadioGroup - a segmented set of mutually exclusive choices. Items are
 * RadioGroupItem children; arrow keys move the selection between items
 * through the shared native radio inputs. Use it for short lists of options
 * that all need to stay visible.
 */
export function RadioGroup(props: ParentProps<RadioGroupProps>) {
  const className = createMemo(() =>
    cn(
      "grid rounded-[calc(var(--radius-lg)+0.25rem)] bg-muted/40 p-1.5",
      props.class,
    ),
  );
  const rest = omit(props, "class", "children");

  return (
    <KRadioGroup {...rest} class={className()}>
      {props.children}
    </KRadioGroup>
  );
}

export interface RadioGroupItemProps
  extends Pick<KRadioGroupItemProps, "value" | "disabled"> {
  class?: string;
  /** Extra classes for the visible item surface. */
  labelClass?: string;
}

/**
 * RadioGroupItem - one choice inside a RadioGroup. Renders a hidden native
 * radio input and a styled label surface that reflects the selected state.
 */
export function RadioGroupItem(props: ParentProps<RadioGroupItemProps>) {
  const className = createMemo(() => cn("relative", props.class));
  const rest = omit(props, "class", "labelClass", "children");

  return (
    <KRadioGroup.Item {...rest} class={className()}>
      <KRadioGroup.ItemInput class="peer" />
      <KRadioGroup.ItemLabel
        class={cn(
          "flex min-h-12 cursor-pointer items-center justify-center rounded-[var(--radius-lg)] px-4 py-2.5 text-base font-medium text-muted-foreground transition-colors hover:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background data-checked:bg-card data-checked:text-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50",
          props.labelClass,
        )}
      >
        {props.children}
      </KRadioGroup.ItemLabel>
    </KRadioGroup.Item>
  );
}

export function RadioGroupLabel(
  props: ParentProps<KRadioGroupLabelProps & { class?: string }>,
) {
  const className = createMemo(() =>
    cn("text-base font-medium text-foreground", props.class),
  );
  const rest = omit(props, "class", "children");

  return (
    <KRadioGroup.Label class={className()} {...rest}>
      {props.children}
    </KRadioGroup.Label>
  );
}

export function RadioGroupDescription(
  props: ParentProps<KRadioGroupDescriptionProps & { class?: string }>,
) {
  const className = createMemo(() =>
    cn("text-base text-muted-foreground", props.class),
  );
  const rest = omit(props, "class", "children");

  return (
    <KRadioGroup.Description class={className()} {...rest}>
      {props.children}
    </KRadioGroup.Description>
  );
}

export function RadioGroupErrorMessage(
  props: ParentProps<KRadioGroupErrorMessageProps & { class?: string }>,
) {
  const className = createMemo(() =>
    cn("text-base text-destructive-text", props.class),
  );
  const rest = omit(props, "class", "children");

  return (
    <KRadioGroup.ErrorMessage class={className()} {...rest}>
      {props.children}
    </KRadioGroup.ErrorMessage>
  );
}
