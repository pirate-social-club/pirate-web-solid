import {
  Combobox as KCombobox,
  type ComboboxRootItemComponentProps,
} from "@kobalte/core/combobox";
import { createMemo } from "solid-js";

import { IconArrowDown, IconCheck } from "@/components/media/icons";
import { cn } from "@/lib/cn";

export interface ComboboxProps<Option> {
  /** Available options. */
  options: Option[];
  /** Extract the submitted value of an option. */
  optionValue: (option: Option) => string;
  /** Extract the display label of an option. */
  optionLabel: (option: Option) => string;
  /** Extract the disabled flag of an option. */
  optionDisabled?: (option: Option) => boolean;
  /** Controlled selected value. */
  value?: string | null;
  /** Uncontrolled default selected value. */
  defaultValue?: string;
  /** Called when the selection changes. */
  onChange?: (value: string | null) => void;
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
}

function ComboboxItem(props: ComboboxRootItemComponentProps<unknown>) {
  const item = props.item;

  return (
    <KCombobox.Item
      item={item}
      class="relative flex w-full cursor-pointer select-none items-center rounded-lg px-8 py-2.5 text-base outline-none transition-colors text-popover-foreground data-highlighted:bg-muted data-highlighted:text-foreground data-selected:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50"
    >
      <KCombobox.ItemIndicator class="absolute start-2.5 flex size-5 items-center justify-center text-primary">
        <IconCheck class="size-4" />
      </KCombobox.ItemIndicator>
      <KCombobox.ItemLabel class="truncate">{item.textValue}</KCombobox.ItemLabel>
    </KCombobox.Item>
  );
}

/**
 * Combobox - a text input with an attached popup list of options. The input
 * accepts free text; picking an option commits its value. Data-driven like
 * Select. Use it when the value set is large and users benefit from typing
 * to narrow the list.
 */
export function Combobox<Option>(props: ComboboxProps<Option>) {
  const className = createMemo(() =>
    cn("flex w-full flex-col gap-1.5", props.class),
  );

  const findOption = (value: string) =>
    props.options.find((option) => props.optionValue(option) === value);

  const selectedOption = () =>
    props.value == null ? null : (findOption(props.value) ?? null);

  const defaultOption = () =>
    props.defaultValue == null ? undefined : findOption(props.defaultValue);

  const rootProps = () =>
    ({
      options: props.options,
      optionValue: props.optionValue,
      optionTextValue: props.optionLabel,
      optionLabel: props.optionLabel,
      optionDisabled: props.optionDisabled,
      value: selectedOption(),
      defaultValue: defaultOption(),
      onChange: (option: Option | Option[] | null) => {
        const first = Array.isArray(option) ? option[0] : option;
        props.onChange?.(
          first == null ? null : props.optionValue(first),
        );
      },
      placeholder: props.placeholder,
      disabled: props.disabled,
      multiple: false,
      itemComponent: ComboboxItem,
    }) as const;

  return (
    <KCombobox {...rootProps()} class={className()}>
      <KCombobox.Control
        class={cn(
          "flex h-11 w-full items-center rounded-full border border-input bg-background px-4 shadow-sm transition-[color,box-shadow,border-color] focus-within:border-border focus-within:ring-1 focus-within:ring-border-soft data-disabled:cursor-not-allowed data-disabled:opacity-50",
          props.inputClass,
        )}
      >
        <KCombobox.Input
          aria-label={props["aria-label"]}
          class="h-full w-full border-0 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        <KCombobox.Trigger class="group flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <IconArrowDown class="size-4 transition-transform group-data-[expanded]:rotate-180" />
        </KCombobox.Trigger>
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
      <KCombobox.HiddenSelect />
    </KCombobox>
  );
}
