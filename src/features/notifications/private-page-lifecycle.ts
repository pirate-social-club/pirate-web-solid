import { refreshSession } from "../../api/session.ts";

let lastRestoration: Event | undefined;
/** Clear before a document can enter Back/Forward cache; restoration earns a
 * fresh session and target read instead of displaying a cached private view. */
export function bindPrivatePageLifecycle(clear: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const restore = (event: PageTransitionEvent) => {
    if (!event.persisted || lastRestoration === event) return;
    lastRestoration = event;
    refreshSession();
  };
  window.addEventListener("pagehide", clear);
  window.addEventListener("pageshow", restore);
  return () => { window.removeEventListener("pagehide", clear); window.removeEventListener("pageshow", restore); };
}
