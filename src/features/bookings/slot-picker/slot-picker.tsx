import { For, Show } from "solid-js";

import { Type, cn } from "../../../design-system";
import { formatCentsAsUsdc, formatSlotDuration, formatSlotTime } from "../booking-format";
import type { IanaTz, ResolvedSlot } from "../view-models";
import {
  getSlotIndexForKey,
  getSlotOptionState,
} from "./slot-picker-model";

export interface SlotPickerProps {
  slots: ResolvedSlot[];
  viewerTimezone: IanaTz;
  /** The selected slot is controlled by the owning booking flow. */
  selectedStartUtc?: string;
  onSelectSlot?: (slot: ResolvedSlot) => void;
  class?: string;
}

export function SlotPicker(props: SlotPickerProps) {
  // Refs are populated only in the browser; keeping them local avoids any DOM
  // access during SSR while allowing listbox arrow-key navigation.
  const optionElements: Array<HTMLButtonElement | undefined> = [];

  const isSelected = (slot: ResolvedSlot) => slot.available && slot.startUtc === props.selectedStartUtc;

  const selectSlot = (slot: ResolvedSlot) => {
    if (slot.available) props.onSelectSlot?.(slot);
  };

  const onKeyDown = (event: KeyboardEvent, index: number, slot: ResolvedSlot) => {
    if (!slot.available) return;
    const next = getSlotIndexForKey(props.slots, index, event.key);
    if (next === null) return;
    event.preventDefault();
    if (next === index) {
      selectSlot(slot);
      return;
    }
    optionElements[next]?.focus();
    const nextSlot = props.slots[next];
    if (nextSlot) selectSlot(nextSlot);
  };

  return (
    <Show
      when={props.slots.length > 0}
      fallback={
        <div class={cn("rounded-[var(--radius-md)] border border-border-soft bg-card p-6 text-center", props.class)}>
          <Type variant="caption">No slots available for this day.</Type>
        </div>
      }
    >
      <div
        class={cn("flex flex-col gap-2 sm:grid sm:grid-cols-3 sm:gap-2", props.class)}
        role="listbox"
        aria-label="Available booking times"
        aria-orientation="vertical"
      >
        <For each={props.slots}>
          {(slot, index) => {
            const selected = () => isSelected(slot);

            return (
              <button
                ref={(element) => { optionElements[index()] = element; }}
                class={cn(
                  "flex items-center justify-between gap-3 rounded-[var(--radius-md)] border p-3 transition-colors",
                  slot.available
                    ? selected()
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border-soft bg-card hover:bg-card/85"
                    : "border-border-soft bg-surface-skeleton opacity-50",
                )}
                disabled={!slot.available}
                onClick={() => selectSlot(slot)}
                onKeyDown={(event) => onKeyDown(event, index(), slot)}
                role="option"
                aria-selected={selected() ? "true" : "false"}
                tabindex={getSlotOptionState(slot, index(), props.slots, props.selectedStartUtc).tabIndex}
                type="button"
              >
                <div class="flex flex-col items-start gap-1">
                  <Type
                    variant="body-strong"
                    class={cn(selected() && "text-primary-foreground")}
                  >
                    {formatSlotTime(slot.startUtc, props.viewerTimezone)}
                  </Type>
                  <Type
                    variant="caption"
                    class={cn(selected() && "text-primary-foreground")}
                  >
                    {formatSlotDuration(slot.startUtc, slot.endUtc)}
                  </Type>
                </div>
                <Type
                  variant="body-strong"
                  class={cn(selected() && "text-primary-foreground")}
                >
                  {formatCentsAsUsdc(slot.priceCents)}
                </Type>
              </button>
            );
          }}
        </For>
      </div>
    </Show>
  );
}
