import { describe, expect, test } from "bun:test";

import type { ResolvedSlot } from "../view-models";
import {
  getAdjacentSlotIndex,
  getSlotIndexForKey,
  getSlotOptionState,
} from "./slot-picker-model";

const slots: ResolvedSlot[] = [
  { startUtc: "2026-07-01T07:00:00Z", endUtc: "2026-07-01T07:30:00Z", priceCents: 6000, available: true },
  { startUtc: "2026-07-01T07:30:00Z", endUtc: "2026-07-01T08:00:00Z", priceCents: 6000, available: false },
  { startUtc: "2026-07-01T08:00:00Z", endUtc: "2026-07-01T08:30:00Z", priceCents: 5000, available: true },
];

describe("SlotPicker", () => {
  test("derives listbox option state with one roving tab stop", () => {
    const states = slots.map((slot, index) => getSlotOptionState(slot, index, slots));

    expect(states).toEqual([
      { selected: false, disabled: false, tabIndex: 0 },
      { selected: false, disabled: true, tabIndex: -1 },
      { selected: false, disabled: false, tabIndex: -1 },
    ]);

    const selectedStates = slots.map((slot, index) =>
      getSlotOptionState(slot, index, slots, slots[2]?.startUtc),
    );
    expect(selectedStates[2]).toEqual({ selected: true, disabled: false, tabIndex: 0 });

    const staleStates = slots.map((slot, index) =>
      getSlotOptionState(slot, index, slots, slots[1]?.startUtc),
    );
    expect(staleStates[1]?.selected).toBe(false);
    expect(staleStates[0]?.tabIndex).toBe(0);
  });

  test("skips an unavailable conflict for adjacent and direct keyboard selection", () => {
    expect(getAdjacentSlotIndex(slots, 0, 1)).toBe(2);
    expect(getAdjacentSlotIndex(slots, 2, -1)).toBe(0);
    expect(getSlotIndexForKey(slots, 0, "ArrowDown")).toBe(2);
    expect(getSlotIndexForKey(slots, 2, "ArrowUp")).toBe(0);
    expect(getSlotIndexForKey(slots, 1, "Enter")).toBeNull();
  });

  test("supports Home/End and controlled selection following keyboard intent", () => {
    let selectedStartUtc: string | undefined;
    const select = (index: number) => {
      const slot = slots[index];
      if (slot?.available) selectedStartUtc = slot.startUtc;
    };

    const last = getSlotIndexForKey(slots, 0, "End");
    expect(last).toBe(2);
    if (last !== null) select(last);
    expect(selectedStartUtc).toBe(slots[2]?.startUtc);

    const first = getSlotIndexForKey(slots, 2, "Home");
    expect(first).toBe(0);
    if (first !== null) select(first);
    expect(selectedStartUtc).toBe(slots[0]?.startUtc);
    expect(getSlotOptionState(slots[0]!, 0, slots, selectedStartUtc).selected).toBe(true);
  });
});
