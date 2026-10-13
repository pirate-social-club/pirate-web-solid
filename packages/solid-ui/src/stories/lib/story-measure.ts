/**
 * Measurement helpers for play functions that assert a story matches the
 * Paper board geometry.
 */

/** Rendered width in whole CSS pixels. */
export function widthOf(element: Element): number {
  return Math.round(element.getBoundingClientRect().width);
}

/**
 * The width a fixed-width story frame can actually take: the board width, or
 * the viewport less the centered layout's 1rem gutters when that is narrower.
 */
export function boardWidth(px: number): number {
  return Math.min(px, window.innerWidth - 32);
}

/**
 * Waits until the canvas is narrower than `px`. A story's `viewport` global
 * resizes the preview frame from the manager, which can land after the play
 * function has started, so phone-only assertions wait for it first.
 */
export async function untilViewportBelow(px: number, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (window.innerWidth >= px) {
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}
