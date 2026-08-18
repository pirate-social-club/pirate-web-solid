import { createEffect, createSignal, type Accessor } from "solid-js";
import { MOBILE_BREAKPOINT_QUERY } from "./breakpoints";

export function createMediaQuery(query: string, serverFallback = false): Accessor<boolean> {
  const [matches, setMatches] = createSignal(serverFallback);

  createEffect(
    () => query,
    () => {
      if (typeof window === "undefined") return;
      const media = window.matchMedia(query);
      const update = () => setMatches(media.matches);
      update();
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    },
  );

  return matches;
}

export function useIsMobile(): Accessor<boolean> {
  return createMediaQuery(MOBILE_BREAKPOINT_QUERY);
}
