import { createUniqueId, For, Show } from "solid-js";

import { cn, Type } from "../../design-system";

export interface RewardRadioCardGroupProps<Value extends string> {
  readonly label: string;
  readonly labels: Record<Value, string>;
  /** Optional one-line explanation under each choice. */
  readonly descriptions?: Record<Value, string>;
  readonly options: readonly Value[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
}

/**
 * Ported from the legacy RewardRadioCardGroup: a labelled radiogroup of full-width
 * rows with roving tabindex and arrow-key movement.
 */
export function RewardRadioCardGroup<Value extends string>(props: RewardRadioCardGroupProps<Value>) {
  const labelId = `reward-radio-${createUniqueId()}`;
  const move = (event: KeyboardEvent, index: number) => {
    const last = props.options.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    if (next === null) return;
    event.preventDefault();
    const value = props.options[next];
    if (value === undefined) return;
    props.onChange(value);
    document.getElementById(`${labelId}-${value}`)?.focus();
  };
  return (
    <div>
      <Type as="span" class="mb-2 block text-muted-foreground" id={labelId} variant="label">
        {props.label}
      </Type>
      <div aria-labelledby={labelId} class="grid gap-2" role="radiogroup">
        <For each={props.options}>
          {(option, index) => {
            const selected = () => props.value === option;
            return (
              <button
                aria-checked={selected() ? "true" : "false"}
                class={cn(
                  "flex items-center gap-3 rounded-lg border px-4 py-3 text-start transition-colors",
                  props.descriptions === undefined && "h-11 py-0",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  selected() ? "border-primary/40 bg-primary-subtle" : "border-border-soft",
                )}
                id={`${labelId}-${option}`}
                onClick={() => props.onChange(option)}
                onKeyDown={(event) => move(event, index())}
                role="radio"
                tabindex={selected() ? 0 : -1}
                type="button"
              >
                <span
                  aria-hidden="true"
                  class={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border",
                    selected() ? "border-primary" : "border-muted-foreground/50",
                  )}
                >
                  {selected() ? <span class="size-2 rounded-full bg-primary" /> : null}
                </span>
                <span class="min-w-0">
                  <Type as="span" class="block" variant="body">{props.labels[option]}</Type>
                  <Show when={props.descriptions?.[option]}>
                    {(description) => (
                      <Type as="span" class="block text-muted-foreground" variant="caption">
                        {description()}
                      </Type>
                    )}
                  </Show>
                </span>
              </button>
            );
          }}
        </For>
      </div>
    </div>
  );
}
