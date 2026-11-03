import { expect, type Locator, type Response } from "playwright/test";

export type SongHandoffTiming = Readonly<{
  termsResponseStartedAtMs: number;
  termsAcknowledgedAtMs: number;
  composerDismissedAtMs: number;
  acknowledgmentToDismissalMs: number;
}>;

/** Install before Post so polling cannot miss an immediate form dismissal. */
export async function observeSongHandoff(composer: Locator) {
  await expect(composer).toBeVisible();
  const observation = await composer.evaluateHandle(element => {
    let dismissedAt: number | null = null;
    const observer = new MutationObserver(() => {
      if (dismissedAt !== null) return;
      if (!element.isConnected || element.getClientRects().length === 0
        || getComputedStyle(element).visibility === "hidden") {
        dismissedAt = performance.timeOrigin + performance.now();
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    });
    return { dismissedAt: () => dismissedAt, disconnect: () => observer.disconnect() };
  });

  return {
    async measure(terms: Response): Promise<SongHandoffTiming> {
      expect(terms.ok(), "Terms must be acknowledged successfully").toBe(true);
      expect(await terms.finished(), "Terms response body must finish successfully").toBeNull();
      const timing = terms.request().timing();
      if (!Number.isFinite(timing.startTime) || timing.startTime <= 0
        || timing.responseStart < 0 || timing.responseEnd < 0) {
        throw new Error("Terms response did not expose completed network timing");
      }
      const dismissedAt = await observation.evaluate(value => value.dismissedAt());
      if (dismissedAt === null) throw new Error("Composer dismissal was not observed");
      const acknowledgedAt = timing.startTime + timing.responseEnd;
      return {
        termsResponseStartedAtMs: timing.startTime + timing.responseStart,
        termsAcknowledgedAtMs: acknowledgedAt,
        composerDismissedAtMs: dismissedAt,
        acknowledgmentToDismissalMs: dismissedAt - acknowledgedAt,
      };
    },
    async dispose() {
      try { await observation.evaluate(value => value.disconnect()); }
      finally { await observation.dispose(); }
    },
  };
}

/** Network completion and DOM timestamps share the browser's epoch clock. */
export function assertPromptSongHandoff(timing: SongHandoffTiming, maximumMs = 3_000): void {
  // Chromium can report loadingFinished just after the response consumer runs.
  // Keep the raw timestamps and allow only this small measurement tolerance.
  expect(timing.acknowledgmentToDismissalMs, "Composer closed before terms acknowledgment")
    .toBeGreaterThanOrEqual(-20);
  expect(timing.acknowledgmentToDismissalMs, "Composer remained after terms acknowledgment")
    .toBeLessThanOrEqual(maximumMs);
}
