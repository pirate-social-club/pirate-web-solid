import {
  Combobox as KCombobox,
  type ComboboxRootProps,
} from "@kobalte/core/combobox";
import { For, Show, createMemo } from "solid-js";

import { Chip } from "@/components/actions/chip/chip";
import { IconArrowDown, IconX } from "@/components/media/icons";
import { cn } from "@/lib/cn";

import { ComboboxItem } from "./combobox";

export interface MultiComboboxProps<Option> {
  /** Available options. */
  options: Option[];
  /** Extract the submitted value of an option. */
  optionValue: (option: Option) => string;
  /** Extract the display label of an option. */
  optionLabel: (option: Option) => string;
  /** Extract the disabled flag of an option. */
  optionDisabled?: (option: Option) => boolean;
  /** Controlled selected values. */
  value?: readonly string[];
  /** Uncontrolled default selected values. */
  defaultValue?: readonly string[];
  /** Called when the selection changes. */
  onChange?: (values: string[]) => void;
  /** Placeholder shown while the input is empty. */
  placeholder?: string;
  disabled?: boolean;
  class?: string;
  /** Extra classes for the input shell. */
  inputClass?: string;
  /** Extra classes for the popup content. */
  contentClass?: string;
  /** Accessible name for the combobox input. */
  "aria-label"?: string;
  /** Native form name. A hidden select is only needed for named form fields. */
  name?: string;
  /** Accessible name for a selected chip's remove control. */
  removeLabel?: (label: string) => string;
  /** Filter predicate for typed input; use it to match search aliases such as a country code. */
  filter?: (option: Option, inputValue: string) => boolean;
}

/**
 * MultiCombobox - the multiple-selection sibling of Combobox. Selected values
 * render as removable chips inside the control; the input filters the same
 * popup list. Use it when the value set is large and users benefit from typing
 * to narrow the list and from seeing every current selection.
 */
export function MultiCombobox<Option>(props: MultiComboboxProps<Option>) {
  const className = createMemo(() =>
    cn("flex w-full flex-col gap-1.5", props.class),
  );

  const findOption = (value: string) =>
    props.options.find((option) => props.optionValue(option) === value);

  const selectedOptions = () =>
    (props.value ?? []).flatMap((value) => {
      const option = findOption(value);
      return option === undefined ? [] : [option];
    });

  const defaultOptions = () =>
    (props.defaultValue ?? []).flatMap((value) => {
      const option = findOption(value);
      return option === undefined ? [] : [option];
    });

  const rootProps = () =>
    ({
      multiple: true,
      options: props.options,
      optionValue: props.optionValue,
      optionTextValue: props.optionLabel,
      optionLabel: props.optionLabel,
      optionDisabled: props.optionDisabled,
      value: props.value === undefined ? undefined : selectedOptions(),
      defaultValue: defaultOptions(),
      defaultFilter: props.filter,
      onChange: (next: unknown) => {
        // A selection always arrives as an array. Kobalte can also hand this
        // handler a non-selection payload, so ignore anything else rather than
        // mapping it into the value state.
        if (!Array.isArray(next)) return;
        props.onChange?.((next as Option[]).map((option) => props.optionValue(option)));
      },
      placeholder: props.placeholder,
      disabled: props.disabled,
      name: props.name,
      itemComponent: ComboboxItem,
    }) as ComboboxRootProps<Option, never, "div">;

  const chipRemoveLabel = (label: string) =>
    props.removeLabel?.(label) ?? `Remove ${label}`;

  return (
    <KCombobox {...rootProps()} class={className()}>
      <KCombobox.Control
        class={cn(
          "flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-[var(--radius-lg)] border border-input bg-background px-3 py-1.5 shadow-sm transition-[color,box-shadow,border-color] focus-within:border-border focus-within:ring-1 focus-within:ring-border-soft data-disabled:cursor-not-allowed data-disabled:opacity-50",
          props.inputClass,
        )}
      >
        {(state: {
          readonly selectedOptions: () => Option[];
          readonly remove: (option: Option) => void;
        }) => (
          <>
            <For each={state.selectedOptions()}>
              {(option) => (
                <Chip
                  aria-label={chipRemoveLabel(props.optionLabel(option))}
                  disabled={props.disabled}
                  onClick={() => state.remove(option)}
                  size="sm"
                  variant="selected"
                >
                  {props.optionLabel(option)}
                  <IconX aria-hidden="true" class="size-3.5" />
                </Chip>
              )}
            </For>
            <KCombobox.Input
              aria-label={props["aria-label"]}
              class="h-8 min-w-24 flex-1 border-0 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            <KCombobox.Trigger class="group ms-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <IconArrowDown class="size-4 transition-transform group-data-[expanded]:rotate-180" />
            </KCombobox.Trigger>
          </>
        )}
      </KCombobox.Control>
      <KCombobox.Portal>
        <KCombobox.Content
          class={cn(
            "z-50 max-w-[var(--kb-popper-anchor-width)] min-w-32 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-popover p-1 text-popover-foreground shadow-md",
            props.contentClass,
          )}
        >
          <KCombobox.Listbox class="max-h-80 overflow-y-auto py-0 outline-none" />
        </KCombobox.Content>
      </KCombobox.Portal>
      <Show when={props.name}>
        <KCombobox.HiddenSelect name={props.name} />
      </Show>
    </KCombobox>
  );
}
