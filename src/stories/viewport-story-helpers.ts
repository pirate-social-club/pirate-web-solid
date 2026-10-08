import { expect, waitFor } from "storybook/test";

/** Check actual layout rather than the presence of responsive class names. */
export async function expectFitsViewport(canvasElement: HTMLElement) {
  await waitFor(() => {
    const root = canvasElement.ownerDocument.documentElement;
    expect(root.scrollWidth, "The story must not widen the viewport").toBeLessThanOrEqual(root.clientWidth + 1);
    for (const element of canvasElement.ownerDocument.querySelectorAll<HTMLElement>('[aria-haspopup="dialog"][title="Activities"], [role="dialog"]')) {
      const bounds = element.getBoundingClientRect();
      expect(bounds.left).toBeGreaterThanOrEqual(-1);
      expect(bounds.right, "Song activity controls must stay on screen").toBeLessThanOrEqual(root.clientWidth + 1);
    }
  });
}
