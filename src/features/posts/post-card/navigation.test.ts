import { describe, expect, test } from "bun:test";

import {
  createCardPointerTracker,
  normalizeUrlForComparison,
  shouldHandleCardClick,
  shouldHandleCardKeydown,
} from "./navigation";

const plainTarget = { closest: () => null } as unknown as EventTarget;
const interactiveTarget = {
  closest: (selector: string) => (selector.includes("button") ? ({} as Element) : null),
} as unknown as EventTarget;

function clickEvent(overrides: Partial<Parameters<typeof shouldHandleCardClick>[0]> = {}) {
  return {
    altKey: false,
    button: 0,
    ctrlKey: false,
    defaultPrevented: false,
    metaKey: false,
    shiftKey: false,
    target: plainTarget,
    ...overrides,
  };
}

describe("card activation guards", () => {
  test("plain primary clicks on the card body navigate", () => {
    expect(shouldHandleCardClick(clickEvent())).toBe(true);
  });

  test("modified, secondary, and prevented clicks do not navigate", () => {
    expect(shouldHandleCardClick(clickEvent({ metaKey: true }))).toBe(false);
    expect(shouldHandleCardClick(clickEvent({ ctrlKey: true }))).toBe(false);
    expect(shouldHandleCardClick(clickEvent({ shiftKey: true }))).toBe(false);
    expect(shouldHandleCardClick(clickEvent({ altKey: true }))).toBe(false);
    expect(shouldHandleCardClick(clickEvent({ button: 1 }))).toBe(false);
    expect(shouldHandleCardClick(clickEvent({ defaultPrevented: true }))).toBe(false);
  });

  test("clicks inside interactive elements do not navigate", () => {
    expect(shouldHandleCardClick(clickEvent({ target: interactiveTarget }))).toBe(false);
    expect(shouldHandleCardClick(clickEvent({ target: null }))).toBe(true);
  });

  test("Enter on the card body navigates; Enter inside interactive elements does not", () => {
    expect(shouldHandleCardKeydown({ defaultPrevented: false, key: "Enter", target: plainTarget })).toBe(true);
    expect(shouldHandleCardKeydown({ defaultPrevented: false, key: "Enter", target: interactiveTarget })).toBe(false);
    expect(shouldHandleCardKeydown({ defaultPrevented: false, key: " ", target: plainTarget })).toBe(false);
    expect(shouldHandleCardKeydown({ defaultPrevented: true, key: "Enter", target: plainTarget })).toBe(false);
  });
});

describe("card pointer drag suppression", () => {
  test("a click at the press point navigates", () => {
    const tracker = createCardPointerTracker();
    tracker.onPointerDown({ isPrimary: true, pointerId: 1, x: 10, y: 10 });
    expect(tracker.shouldSuppressClick({ x: 10, y: 10 })).toBe(false);
  });

  test("a click that ends a drag is suppressed", () => {
    const tracker = createCardPointerTracker();
    tracker.onPointerDown({ isPrimary: true, pointerId: 1, x: 10, y: 10 });
    expect(tracker.shouldSuppressClick({ x: 80, y: 14 })).toBe(true);
  });

  test("a cancelled gesture clears drag state so the next click navigates", () => {
    const tracker = createCardPointerTracker();
    tracker.onPointerDown({ isPrimary: true, pointerId: 1, x: 10, y: 10 });
    tracker.onPointerCancel({ pointerId: 1 });
    expect(tracker.shouldSuppressClick({ x: 80, y: 14 })).toBe(false);
  });

  test("a secondary pointer neither overwrites nor clears the primary drag state", () => {
    const tracker = createCardPointerTracker();
    tracker.onPointerDown({ isPrimary: true, pointerId: 1, x: 10, y: 10 });
    tracker.onPointerDown({ isPrimary: false, pointerId: 2, x: 40, y: 40 });
    tracker.onPointerCancel({ pointerId: 2 });
    expect(tracker.shouldSuppressClick({ x: 80, y: 14 })).toBe(true);
  });

  test("a click without a tracked press navigates", () => {
    const tracker = createCardPointerTracker();
    expect(tracker.shouldSuppressClick({ x: 10, y: 10 })).toBe(false);
  });
});

describe("normalizeUrlForComparison", () => {
  test("strips hashes and trailing slashes", () => {
    expect(normalizeUrlForComparison("https://example.com/event/#tickets"))
      .toBe("https://example.com/event");
    expect(normalizeUrlForComparison("https://example.com/event/"))
      .toBe("https://example.com/event");
  });

  test("returns null for empty input and keeps unmatched input comparable", () => {
    expect(normalizeUrlForComparison(undefined)).toBeNull();
    expect(normalizeUrlForComparison("")).toBeNull();
    expect(normalizeUrlForComparison("not a url/")).toBe("not a url");
  });
});

