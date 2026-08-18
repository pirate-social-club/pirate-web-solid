// Card-level navigation policy, extracted from the React post-card.tsx so the
// guards and the pointer-drag suppression are pure and directly testable.

/** Elements inside the card that own their own activation. */
const POST_CARD_INTERACTIVE_SELECTOR =
  "a,button,input,select,textarea,summary,[role='button'],[role='menu'],[role='menuitem'],[data-post-card-interactive='true']";

export interface CardActivationEventLike {
  defaultPrevented: boolean;
  target: EventTarget | null;
}

export interface CardClickEventLike extends CardActivationEventLike {
  button: number;
  metaKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

function targetIsInteractive(target: EventTarget | null): boolean {
  // Duck-typed so the guard is testable without a DOM.
  const closest = (target as Element | null)?.closest;
  if (typeof closest !== "function") return false;
  return Boolean(closest.call(target, POST_CARD_INTERACTIVE_SELECTOR));
}

/** Plain clicks on the card body navigate; modified clicks and clicks on
    interactive children do not. */
export function shouldHandleCardClick(event: CardClickEventLike): boolean {
  if (
    event.defaultPrevented
    || event.button !== 0
    || event.metaKey
    || event.altKey
    || event.ctrlKey
    || event.shiftKey
  ) {
    return false;
  }
  return !targetIsInteractive(event.target);
}

/** Enter on the card body navigates; Enter inside interactive children does not. */
export function shouldHandleCardKeydown(event: { key: string } & CardActivationEventLike): boolean {
  if (event.defaultPrevented || event.key !== "Enter") {
    return false;
  }
  return !targetIsInteractive(event.target);
}

export interface PointerPosition {
  pointerId: number;
  x: number;
  y: number;
}

const CARD_DRAG_THRESHOLD_PX = 6;

/**
 * Tracks the primary pointer so a press that moves past a small threshold is
 * treated as a drag (scrubber seek released off-track, text selection), not a
 * card click. Clicks that end a drag land on a common ancestor, so the
 * interactive-element guard cannot see them. Only the primary pointer is
 * tracked: secondary touches neither overwrite its position nor clear it when
 * they cancel, and a cancelled primary gesture produces no click, so its state
 * clears on pointercancel rather than going stale.
 */
export function createCardPointerTracker(thresholdPx = CARD_DRAG_THRESHOLD_PX) {
  let down: PointerPosition | null = null;

  return {
    onPointerDown(event: { isPrimary: boolean } & PointerPosition): void {
      if (event.isPrimary) {
        down = { pointerId: event.pointerId, x: event.x, y: event.y };
      }
    },
    onPointerCancel(event: { pointerId: number }): void {
      if (down?.pointerId === event.pointerId) {
        down = null;
      }
    },
    /** Returns true when the click ends a drag and must be ignored. Always
        clears the tracked press, matching the click that follows it. */
    shouldSuppressClick(event: { x: number; y: number }): boolean {
      const tracked = down;
      down = null;
      if (!tracked) return false;
      return Math.hypot(event.x - tracked.x, event.y - tracked.y) > thresholdPx;
    },
  };
}

export function normalizeUrlForComparison(url: string | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/u, "");
  } catch {
    return url.trim().replace(/\/$/u, "") || null;
  }
}

export function formatSourceLanguage(
  sourceLanguage: string | null | undefined,
  locale: string,
): string | null {
  const normalized = String(sourceLanguage ?? "").trim();
  if (!normalized) return null;

  try {
    const displayNames = new Intl.DisplayNames([locale], { type: "language" });
    return displayNames.of(normalized) ?? normalized;
  } catch {
    return normalized;
  }
}
