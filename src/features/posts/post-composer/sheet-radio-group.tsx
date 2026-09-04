import { For } from "solid-js";
import type { JSX } from "@solidjs/web";

import {
  RadioGroup,
  RadioGroupItem,
  RadioIndicator,
  Type,
  cn,
} from "../../../design-system";

export interface PostComposerSheetRadioOption<T extends string> {
  description?: string;
  icon: JSX.Element;
  label: string;
  value: T;
}

/**
 * A compact, single-select list for composer sheets. Selection behavior comes
 * from the design-system RadioGroup; this component only supplies the flat row
 * treatment shared by audience, age-gate, and identity selectors.
 */
export function PostComposerSheetRadioGroup<T extends string>(props: {
  "aria-label": string;
  disabled?: boolean;
  onChange: (value: T) => void;
  options: readonly PostComposerSheetRadioOption<T>[];
  value: T;
}) {
  return (
    <RadioGroup
      aria-label={props["aria-label"]}
      class="gap-0 rounded-none border-y border-border-soft bg-transparent p-0"
      disabled={props.disabled}
      onChange={(value) => {
        const selected = props.options.find((option) => option.value === value);
        if (selected) props.onChange(selected.value);
      }}
      value={props.value}
    >
      <For each={props.options}>
        {(option) => {
          const checked = () => props.value === option.value;

          return (
            <RadioGroupItem
              class="border-b border-border-soft last:border-b-0"
              disabled={props.disabled}
              labelClass={cn(
                "grid min-h-16 w-full cursor-pointer grid-cols-[2.75rem_1fr_auto] items-center justify-normal gap-3 rounded-none px-4 py-3 text-start hover:bg-muted/60 data-checked:bg-primary-subtle data-checked:text-foreground",
              )}
              value={option.value}
            >
              <span class="grid size-11 place-items-center overflow-hidden rounded-full bg-background text-foreground">
                {option.icon}
              </span>
              <span class="min-w-0">
                <Type as="span" variant="body-strong" class="block truncate">
                  {option.label}
                </Type>
                {option.description
                  ? (
                      <Type as="span" variant="caption" class="block text-muted-foreground">
                        {option.description}
                      </Type>
                    )
                  : null}
              </span>
              <RadioIndicator checked={checked()} />
            </RadioGroupItem>
          );
        }}
      </For>
    </RadioGroup>
  );
}
