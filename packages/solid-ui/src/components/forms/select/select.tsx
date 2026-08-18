import {
  Select as KSelect,
  type SelectRootItemComponentProps,
} from "@kobalte/core/select";
import type { JSX } from "@solidjs/web";
import { createMemo, type Component } from "solid-js";

import { IconArrowDown, IconCheck } from "@/components/media/icons";
import { cn } from "@/lib/cn";

export interface SelectProps<Option> {
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
  /** Rendered in the trigger when no value is selected. */
  placeholder?: JSX.Element;
  disabled?: boolean;
  class?: string;
  /** Extra classes for the trigger button. */
  triggerClass?: string;
  /** Extra classes for the popup content. */
  contentClass?: string;
  /** Preferred popper placement for the option list. */
  placement?: "top" | "top-start" | "top-end" | "bottom" | "bottom-start" | "bottom-end" | "left" | "left-start" | "left-end" | "right" | "right-start" | "right-end";
  /** Provider-neutral rendering for an option's visible label content. */
  renderOption?: (option: Option) => JSX.Element;
  /** Provider-neutral rendering for the selected trigger value. */
  renderValue?: (option: Option | null) => JSX.Element;
  /** Native form name for the hidden select control. */
  name?: string;
  /** Accessible name for the select trigger. */
  "aria-label"?: string;
}

function SelectItem(
  props: SelectRootItemComponentProps<unknown> & {
    renderOption?: (option: unknown) => JSX.Element;
  },
) {
  const item = props.item;

  return (
    <KSelect.Item
      item={item}
      class="relative flex w-full cursor-pointer select-none items-center rounded-lg px-8 py-2.5 text-base outline-none transition-colors text-popover-foreground data-highlighted:bg-muted data-highlighted:text-foreground data-selected:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50"
    >
      <KSelect.ItemIndicator class="absolute start-2.5 flex size-5 items-center justify-center text-primary">
        <IconCheck class="size-4" />
      </KSelect.ItemIndicator>
      <KSelect.ItemLabel class="min-w-0 truncate">
        {props.renderOption ? props.renderOption(item.rawValue) : item.textValue}
      </KSelect.ItemLabel>
    </KSelect.Item>
  );
}

/**
 * Select - a popup menu of mutually exclusive options. Data-driven: feed it
 * options plus optionValue/optionLabel accessors and it renders the trigger,
 * popup listbox, and hidden form input. Use it for long option lists where a
 * RadioGroup would dominate the screen.
 */
export function Select<Option>(props: SelectProps<Option>) {
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
      name: props.name,
      placement: props.placement,
      multiple: false,
      itemComponent: ((itemProps: SelectRootItemComponentProps<Option>) => (
        <SelectItem
          {...itemProps}
          renderOption={props.renderOption as ((option: unknown) => JSX.Element) | undefined}
        />
      )) as Component<SelectRootItemComponentProps<Option>>,
    }) as const;

  return (
    <KSelect {...rootProps()} class={className()}>
      <KSelect.Trigger
        aria-label={props["aria-label"]}
        class={cn(
          "flex h-11 w-full cursor-pointer items-center justify-between rounded-full border border-input bg-background px-4 py-2 text-base shadow-sm transition-[color,box-shadow,border-color] data-disabled:cursor-not-allowed data-disabled:opacity-50 data-expanded:border-border data-expanded:ring-1 data-expanded:ring-border-soft data-[placeholder-shown]:text-muted-foreground",
          props.triggerClass,
        )}
      >
        <KSelect.Value<Option> class="truncate">
          {(state) =>
            props.renderValue
              ? props.renderValue(state.selectedOption())
              : state.selectedOption() != null
                ? props.optionLabel(state.selectedOption()!)
                : undefined
          }
        </KSelect.Value>
        <KSelect.Icon class="group ms-2 shrink-0 text-muted-foreground">
          <IconArrowDown class="size-4 transition-transform group-data-[expanded]:rotate-180" />
        </KSelect.Icon>
      </KSelect.Trigger>
      <KSelect.Portal>
        <KSelect.Content
          class={cn(
            "z-50 max-w-[var(--kb-popper-anchor-width)] min-w-32 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-popover p-1 text-popover-foreground shadow-md",
            props.contentClass,
          )}
        >
          <KSelect.Listbox class="max-h-80 overflow-y-auto py-0 outline-none" />
        </KSelect.Content>
      </KSelect.Portal>
      <KSelect.HiddenSelect name={props.name} />
    </KSelect>
  );
}
