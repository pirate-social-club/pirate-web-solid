import type { ResolvedSlot } from "../view-models";

export interface SlotOptionState {
  selected: boolean;
  disabled: boolean;
  tabIndex: 0 | -1;
}

/** Resolve the ARIA/focus state for one option without touching the DOM. */
export function getSlotOptionState(
  slot: ResolvedSlot,
  index: number,
  slots: ReadonlyArray<ResolvedSlot>,
  selectedStartUtc?: string,
): SlotOptionState {
  const selected = slot.available && slot.startUtc === selectedStartUtc;
  const firstAvailableIndex = slots.findIndex((candidate) => candidate.available);
  const selectedAvailable = slots.some(
    (candidate) => candidate.available && candidate.startUtc === selectedStartUtc,
  );
  return {
    selected,
    disabled: !slot.available,
    tabIndex: slot.available && (
      selected || (!selectedAvailable && index === firstAvailableIndex)
    )
      ? 0
      : -1,
  };
}

/** Return the next available option index for listbox keyboard navigation. */
export function getAdjacentSlotIndex(
  slots: ReadonlyArray<ResolvedSlot>,
  index: number,
  direction: 1 | -1,
): number | null {
  for (let next = index + direction; next >= 0 && next < slots.length; next += direction) {
    if (slots[next]?.available) return next;
  }
  return null;
}

/** Map the listbox navigation keys to an available option index. */
export function getSlotIndexForKey(
  slots: ReadonlyArray<ResolvedSlot>,
  index: number,
  key: string,
): number | null {
  if (!slots[index]?.available) return null;
  if (key === "Enter" || key === " ") return index;
  if (key === "ArrowDown" || key === "ArrowRight") return getAdjacentSlotIndex(slots, index, 1);
  if (key === "ArrowUp" || key === "ArrowLeft") return getAdjacentSlotIndex(slots, index, -1);
  if (key === "Home") return slots.findIndex((slot) => slot.available) === -1
    ? null
    : slots.findIndex((slot) => slot.available);
  if (key === "End") {
    for (let next = slots.length - 1; next >= 0; next -= 1) {
      if (slots[next]?.available) return next;
    }
  }
  return null;
}
