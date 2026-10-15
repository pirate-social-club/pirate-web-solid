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
 *
 * It throws rather than returning when the canvas never narrows, so a phone
 * assertion fails loudly instead of being skipped (for example when the story
 * is opened outside the manager, where the viewport global has no effect).
 */
export async function untilViewportBelow(px: number, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (window.innerWidth >= px) {
    if (Date.now() > deadline) {
      throw new Error(
        `The canvas stayed ${window.innerWidth}px wide; this story's phone assertions need it narrower than ${px}px. Open it in the Storybook manager so its viewport global applies.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
