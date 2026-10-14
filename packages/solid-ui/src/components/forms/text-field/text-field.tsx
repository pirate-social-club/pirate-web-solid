import {
  TextField as KTextField,
  type TextFieldDescriptionProps as KTextFieldDescriptionProps,
  type TextFieldErrorMessageProps as KTextFieldErrorMessageProps,
  type TextFieldInputProps as KTextFieldInputProps,
  type TextFieldLabelProps as KTextFieldLabelProps,
  type TextFieldRootProps,
} from "@kobalte/core/text-field";
import { createMemo, omit, type ParentProps } from "solid-js";

import { inputVariants } from "@/components/forms/input/input";
import { cn } from "@/lib/cn";
import { type VariantProps } from "@/lib/recipe";

export function TextField(
  props: ParentProps<TextFieldRootProps & { class?: string }>,
) {
  const className = createMemo(() =>
    cn("flex w-full flex-col gap-1.5", props.class),
  );
  const rest = omit(props, "class");

  return (
    <KTextField {...rest} class={className()}>
      {props.children}
    </KTextField>
  );
}

export function TextFieldLabel(
  props: ParentProps<KTextFieldLabelProps & { class?: string }>,
) {
  const className = createMemo(() =>
    cn("text-base font-medium text-foreground", props.class),
  );
  const rest = omit(props, "class");

  return (
    <KTextField.Label {...rest} class={className()}>
      {props.children}
    </KTextField.Label>
  );
}

export interface TextFieldInputProps
  extends KTextFieldInputProps,
    VariantProps<typeof inputVariants> {
  class?: string;
  autocomplete?: string;
  disabled?: boolean;
  inputmode?: string;
  maxlength?: number;
  placeholder?: string;
  required?: boolean;
  spellcheck?: boolean;
}

export function TextFieldInput(props: TextFieldInputProps) {
  const className = createMemo(() =>
    cn(
      inputVariants({ variant: props.variant, size: props.size }),
      props.class,
    ),
  );
  const rest = omit(props, "class", "variant", "size");

  return <KTextField.Input dir="auto" {...rest} class={className()} />;
}

export function TextFieldDescription(
  props: ParentProps<KTextFieldDescriptionProps & { class?: string }>,
) {
  const className = createMemo(() =>
    cn("text-base text-muted-foreground", props.class),
  );
  const rest = omit(props, "class");

  return (
    <KTextField.Description {...rest} class={className()}>
      {props.children}
    </KTextField.Description>
  );
}

export function TextFieldErrorMessage(
  props: ParentProps<KTextFieldErrorMessageProps & { class?: string }>,
) {
  const className = createMemo(() =>
    cn("text-base text-destructive-text", props.class),
  );
  const rest = omit(props, "class");

  return (
    <KTextField.ErrorMessage {...rest} class={className()}>
      {props.children}
    </KTextField.ErrorMessage>
  );
}
