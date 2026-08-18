import { createEffect, createSignal, type Accessor } from "solid-js";
import { isServer } from "@solidjs/web";

/**
 * DS-owned hydration guard: the Solid equivalent of the React app's
 * `useClientHydrated` hook. Returns `false` during SSR and the first client
 * render, then `true` once effects run on the client. Gate client-only
 * rendering decisions (breakpoint switches, browser measurements) on it
 * instead of touching browser APIs at module scope.
 */
export function createClientHydrated(): Accessor<boolean> {
  // ownedWrite: the mount effect below flips the signal from its apply phase.
  const [hydrated, setHydrated] = createSignal(false, { ownedWrite: true });
  // Solid 2 effects take a compute and an effect function and never run
  // during SSR, so the signal flips only after client mount.
  createEffect(
    () => !isServer,
    (isClient) => {
      if (isClient) setHydrated(true);
    },
  );
  return hydrated;
}
