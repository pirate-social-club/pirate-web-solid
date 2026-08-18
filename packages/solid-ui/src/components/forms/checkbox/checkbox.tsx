import {
  Checkbox as KCheckbox,
  type CheckboxDescriptionProps as KCheckboxDescriptionProps,
  type CheckboxErrorMessageProps as KCheckboxErrorMessageProps,
  type CheckboxLabelProps as KCheckboxLabelProps,
  type CheckboxRootProps,
} from "@kobalte/core/checkbox";
import { createMemo, omit, type ParentProps } from "solid-js";

import { IconCheck } from "@/components/media/icons";
import { cn } from "@/lib/cn";

export interface CheckboxProps extends CheckboxRootProps {
  class?: string;
  /** Extra classes for the visible box. */
  controlClass?: string;
  /** Extra classes for the check indicator. */
  indicatorClass?: string;
  /** Accessible name for the checkbox input itself. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

/**
 * Checkbox - a styled checkbox control. The visible box is a Kobalte
 * Checkbox.Control; the real input stays in the accessibility tree and
 * keyboard-focusable (visually clipped). Accepts a CheckboxLabel,
 * CheckboxDescription, or CheckboxErrorMessage as children, mirroring the
 * TextField compound API.
 */
export function Checkbox(props: ParentProps<CheckboxProps>) {
  const className = createMemo(() =>
    cn("inline-flex items-center gap-2 align-middle", props.class),
  );
  const rest = omit(
    props,
    "class",
    "controlClass",
    "indicatorClass",
    "aria-label",
    "aria-labelledby",
    "aria-describedby",
    "children",
  );

  return (
    <KCheckbox {...rest} class={className()}>
      <KCheckbox.Input
        class="peer"
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"]}
        aria-describedby={props["aria-describedby"]}
      />
      <KCheckbox.Control
        class={cn(
          "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-input bg-background text-primary-foreground shadow-sm transition-[color,box-shadow,border-color,background-color] outline-none data-checked:border-primary data-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background data-disabled:cursor-not-allowed data-disabled:opacity-50",
          props.controlClass,
        )}
      >
        <KCheckbox.Indicator
          class={cn(
            "group flex items-center justify-center",
            props.indicatorClass,
          )}
        >
          <IconCheck class="size-4 group-data-[indeterminate]:hidden" />
          <span class="hidden h-1 w-3.5 rounded-[1px] bg-current group-data-[indeterminate]:block" />
        </KCheckbox.Indicator>
      </KCheckbox.Control>
      {props.children}
    </KCheckbox>
  );
}

export function CheckboxLabel(
  props: ParentProps<KCheckboxLabelProps & { class?: string }>,
) {
  const className = createMemo(() =>
    cn(
      "cursor-pointer text-base font-medium text-foreground data-disabled:cursor-not-allowed data-disabled:opacity-70",
      props.class,
    ),
  );
  const rest = omit(props, "class", "children");

  return (
    <KCheckbox.Label class={className()} {...rest}>
      {props.children}
    </KCheckbox.Label>
  );
}

export function CheckboxDescription(
  props: ParentProps<KCheckboxDescriptionProps & { class?: string }>,
) {
  const className = createMemo(() =>
    cn("text-base text-muted-foreground", props.class),
  );
  const rest = omit(props, "class", "children");

  return (
    <KCheckbox.Description class={className()} {...rest}>
      {props.children}
    </KCheckbox.Description>
  );
}

export function CheckboxErrorMessage(
  props: ParentProps<KCheckboxErrorMessageProps & { class?: string }>,
) {
  const className = createMemo(() =>
    cn("text-base text-destructive-text", props.class),
  );
  const rest = omit(props, "class", "children");

  return (
    <KCheckbox.ErrorMessage class={className()} {...rest}>
      {props.children}
    </KCheckbox.ErrorMessage>
  );
}
