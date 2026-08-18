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
    <KTextField class={className()} {...rest}>
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
    <KTextField.Label class={className()} {...rest}>
      {props.children}
    </KTextField.Label>
  );
}

export interface TextFieldInputProps
  extends KTextFieldInputProps,
    VariantProps<typeof inputVariants> {
  class?: string;
}

export function TextFieldInput(props: TextFieldInputProps) {
  const className = createMemo(() =>
    cn(
      inputVariants({ variant: props.variant, size: props.size }),
      props.class,
    ),
  );
  const rest = omit(props, "class", "variant", "size");

  return <KTextField.Input dir="auto" class={className()} {...rest} />;
}

export function TextFieldDescription(
  props: ParentProps<KTextFieldDescriptionProps & { class?: string }>,
) {
  const className = createMemo(() =>
    cn("text-base text-muted-foreground", props.class),
  );
  const rest = omit(props, "class");

  return (
    <KTextField.Description class={className()} {...rest}>
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
    <KTextField.ErrorMessage class={className()} {...rest}>
      {props.children}
    </KTextField.ErrorMessage>
  );
}
