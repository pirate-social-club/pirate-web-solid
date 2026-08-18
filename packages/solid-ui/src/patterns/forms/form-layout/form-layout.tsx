import type { JSX } from "@solidjs/web";
import { createMemo, omit } from "solid-js";
import { Show } from "solid-js";

import { Type } from "@/components/data-display/type/type";
import { Label } from "@/components/forms/label/label";
import { cn } from "@/lib/cn";

export interface FormFieldLabelProps {
  class?: string;
  counter?: JSX.Element;
  htmlFor?: string;
  label: JSX.Element;
  labelClass?: string;
  required?: boolean;
  tone?: "default" | "muted";
}

/**
 * FormFieldLabel - the standard field header: a Label plus optional required
 * marker and a right-aligned counter. Use it above every TextField, Select,
 * and Combobox field. The label belongs to the field via htmlFor.
 */
export function FormFieldLabel(props: FormFieldLabelProps) {
  const className = createMemo(() =>
    cn("flex items-center justify-between gap-3", props.class),
  );

  return (
    <div class={className()}>
      <Label class={props.labelClass} for={props.htmlFor} tone={props.tone}>
        {props.label}
        <Show when={props.required}>
          <span aria-hidden="true" class="ms-0.5 text-destructive-text">
            *
          </span>
        </Show>
      </Label>
      <Show when={props.counter}>
        <Type variant="caption">{props.counter}</Type>
      </Show>
    </div>
  );
}

export interface FormSectionHeadingProps {
  class?: string;
  description?: JSX.Element;
  title: JSX.Element;
}

/**
 * FormSectionHeading - a section title plus optional supporting description
 * for grouping related fields inside a form.
 */
export function FormSectionHeading(props: FormSectionHeadingProps) {
  const className = createMemo(() => cn("space-y-1", props.class));

  return (
    <div class={className()}>
      <Type as="h3" variant="body-strong">
        {props.title}
      </Type>
      <Show when={props.description}>
        <Type as="p" variant="caption">
          {props.description}
        </Type>
      </Show>
    </div>
  );
}

export interface FormNoteProps {
  children?: JSX.Element;
  class?: string;
  tone?: "default" | "muted" | "destructive" | "warning";
}

const formNoteToneClass: Record<NonNullable<FormNoteProps["tone"]>, string> = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  destructive: "text-destructive-text",
  warning: "text-warning",
};

/**
 * FormNote - supporting copy under a field: hints, warnings, or error
 * fallbacks that are not tied to the field's own error channel.
 */
export function FormNote(props: FormNoteProps) {
  const className = createMemo(() =>
    cn(formNoteToneClass[props.tone ?? "muted"], props.class),
  );

  return (
    <Type as="p" variant="caption" class={className()}>
      {props.children}
    </Type>
  );
}
