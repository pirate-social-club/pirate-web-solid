import {
  Switch as KSwitch,
  type SwitchDescriptionProps as KSwitchDescriptionProps,
  type SwitchErrorMessageProps as KSwitchErrorMessageProps,
  type SwitchLabelProps as KSwitchLabelProps,
  type SwitchRootProps,
} from "@kobalte/core/switch";
import { createMemo, omit, type ParentProps } from "solid-js";

import { cn } from "@/lib/cn";

export interface SwitchProps extends SwitchRootProps {
  class?: string;
  /** Extra classes for the track. */
  controlClass?: string;
  /** Extra classes for the knob. */
  thumbClass?: string;
  /** Accessible name for the switch input itself. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

/**
 * Switch - an on/off control with a sliding knob. The real input stays in
 * the accessibility tree and keyboard-focusable; the track and thumb are
 * purely visual. Accepts a SwitchLabel, SwitchDescription, or
 * SwitchErrorMessage as children, mirroring the TextField compound API.
 */
export function Switch(props: ParentProps<SwitchProps>) {
  const className = createMemo(() =>
    cn("inline-flex items-center gap-2", props.class),
  );
  const rest = omit(
    props,
    "class",
    "controlClass",
    "thumbClass",
    "aria-label",
    "aria-labelledby",
    "aria-describedby",
    "children",
  );

  return (
    <KSwitch {...rest} class={className()}>
      <KSwitch.Input
        class="peer"
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"]}
        aria-describedby={props["aria-describedby"]}
      />
      <KSwitch.Control
        class={cn(
          "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-input bg-input transition-colors data-checked:border-primary data-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background data-disabled:cursor-not-allowed data-disabled:opacity-50",
          props.controlClass,
        )}
      >
        <KSwitch.Thumb
          class={cn(
            "block size-5 translate-x-1 rounded-full bg-foreground shadow-sm transition-transform data-checked:translate-x-6 rtl:-translate-x-1 rtl:data-checked:-translate-x-6 light:bg-background",
            props.thumbClass,
          )}
        />
      </KSwitch.Control>
      {props.children}
    </KSwitch>
  );
}

export function SwitchLabel(
  props: ParentProps<KSwitchLabelProps & { class?: string }>,
) {
  const className = createMemo(() =>
    cn(
      "cursor-pointer text-base font-medium text-foreground data-disabled:cursor-not-allowed data-disabled:opacity-70",
      props.class,
    ),
  );
  const rest = omit(props, "class", "children");

  return (
    <KSwitch.Label class={className()} {...rest}>
      {props.children}
    </KSwitch.Label>
  );
}

export function SwitchDescription(
  props: ParentProps<KSwitchDescriptionProps & { class?: string }>,
) {
  const className = createMemo(() =>
    cn("text-base text-muted-foreground", props.class),
  );
  const rest = omit(props, "class", "children");

  return (
    <KSwitch.Description class={className()} {...rest}>
      {props.children}
    </KSwitch.Description>
  );
}

export function SwitchErrorMessage(
  props: ParentProps<KSwitchErrorMessageProps & { class?: string }>,
) {
  const className = createMemo(() =>
    cn("text-base text-destructive-text", props.class),
  );
  const rest = omit(props, "class", "children");

  return (
    <KSwitch.ErrorMessage class={className()} {...rest}>
      {props.children}
    </KSwitch.ErrorMessage>
  );
}
