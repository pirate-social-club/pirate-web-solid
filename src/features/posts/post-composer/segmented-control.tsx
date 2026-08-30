import { For } from "solid-js";

import { RadioGroup, RadioGroupItem } from "../../../design-system";

export interface PostComposerSegmentedOption {
  label: string;
  value: string;
}

/** A compact radio group for two or more mutually exclusive composer modes. */
export function PostComposerSegmentedControl(props: {
  "aria-label": string;
  onChange: (value: string) => void;
  options: readonly PostComposerSegmentedOption[];
  value: string;
}) {
  return (
    <RadioGroup
      aria-label={props["aria-label"]}
      class="block rounded-none bg-transparent p-0"
      onChange={props.onChange}
      value={props.value}
    >
      <div class="grid grid-cols-2 rounded-xl bg-muted p-1">
        <For each={props.options}>
          {(option) => (
            <RadioGroupItem
              class="min-w-0"
              labelClass="h-10 min-h-10 rounded-lg px-3 text-sm font-semibold"
              value={option.value}
            >
              {option.label}
            </RadioGroupItem>
          )}
        </For>
      </div>
    </RadioGroup>
  );
}
