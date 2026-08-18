import { createEffect, createSignal, omit } from "solid-js";

import { Input, type InputProps } from "@/components/forms/input/input";

export interface EditableNumberInputProps
  extends Omit<InputProps, "onChange" | "onInput" | "value" | "type"> {
  /** The committed numeric value. */
  value: number;
  /** Called with the parsed number whenever the draft text parses. */
  onValueChange: (value: number) => void;
}

/**
 * EditableNumberInput - a number input that lets the user clear the field
 * without immediately committing. The draft text is local while the input is
 * focused; blur or an external value change restores the canonical value.
 */
export function EditableNumberInput(props: EditableNumberInputProps) {
  let inputRef: HTMLInputElement | undefined;

  // Draft text is local while focused; undefined means "show the canonical
  // value". ownedWrite: the apply phase below writes draft when the external
  // value changes while the input is not focused.
  const [draft, setDraft] = createSignal<string | undefined>(undefined, {
    ownedWrite: true,
  });

  createEffect(
    () => props.value,
    (value) => {
      if (document.activeElement !== inputRef) {
        setDraft(String(value));
      }
    },
  );

  const rest = omit(props, "value", "onValueChange", "ref");

  return (
    <Input
      {...rest}
      ref={(el) => {
        inputRef = el;
        (props.ref as ((el: HTMLInputElement) => void) | undefined)?.(el);
      }}
      type="number"
      value={draft() ?? String(props.value)}
      onInput={(event) => {
        const next = event.currentTarget.value;
        setDraft(next);
        const parsed = Number.parseInt(next, 10);
        if (!Number.isNaN(parsed)) props.onValueChange(parsed);
      }}
      onBlur={(event) => {
        setDraft(String(props.value));
        (props.onBlur as ((event: FocusEvent) => void) | undefined)?.(event);
      }}
    />
  );
}
