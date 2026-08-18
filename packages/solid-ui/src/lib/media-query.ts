import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";

export const MOBILE_BREAKPOINT = 768;
export const MOBILE_BREAKPOINT_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/**
 * SSR-safe media query signal: returns the server fallback during SSR and the
 * first client render, then tracks the live query. Pair with
 * createClientHydrated when a surface must not switch layouts during
 * hydration.
 */
export function createMediaQuery(query: string, serverFallback = false): Accessor<boolean> {
  // ownedWrite: the tracking effect below writes matches from its apply phase.
  const [matches, setMatches] = createSignal(serverFallback, { ownedWrite: true });

  createEffect(
    () => query,
    (activeQuery) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return;
      }
      const media = window.matchMedia(activeQuery);
      const update = () => setMatches(media.matches);
      update();
      media.addEventListener("change", update);
      onCleanup(() => media.removeEventListener("change", update));
    },
  );

  return matches;
}

export function createIsMobile(): Accessor<boolean> {
  return createMediaQuery(MOBILE_BREAKPOINT_QUERY);
}
