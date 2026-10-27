import type { JSX } from "@solidjs/web";
import { createContext, createEffect, createSignal, onCleanup, untrack, useContext, type Accessor } from "solid-js";
import { captureSessionAuthority, isCurrentSessionAuthority } from "../../api/browser-session-events.ts";
import { createSessionApiClient, type PirateApiClient } from "../../api/client.ts";
import { onSessionRefreshed } from "../../api/session.ts";
import { useApplicationSession, useApplicationSessionPending } from "../shell/application-session.tsx";

const FRESHNESS_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const RENEW_AFTER_MS = 45_000;
type PolicyClient = Pick<PirateApiClient, "get_rewardsQualificationPolicies">;

/** A policy read exposes the service entry point, never permission to spend. */
export const RewardServiceAvailabilityContext = createContext<Accessor<boolean>>(() => false);

export function useRewardServiceAvailability(): Accessor<boolean> {
  return useContext(RewardServiceAvailabilityContext);
}

/** One browser read shared by every card; server rendering always stays hidden. */
export function RewardServiceAvailabilityProvider(props: {
  readonly children: JSX.Element;
  readonly client?: PolicyClient;
}) {
  const session = useApplicationSession();
  const pending = useApplicationSessionPending();
  // Session effects revoke visibility synchronously before stale UI can act.
  const [available, setAvailable] = createSignal(false, { ownedWrite: true });
  let generation = 0;
  let alive = true;
  let request: AbortController | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let renewal: ReturnType<typeof setTimeout> | undefined;

  const invalidate = () => {
    generation += 1;
    setAvailable(false);
    request?.abort();
    request = undefined;
    clearTimeout(deadline);
    clearTimeout(expiry);
    clearTimeout(renewal);
  };
  const refresh = () => {
    if (typeof window === "undefined" || !alive || request) return;
    const account = session();
    const epoch = captureSessionAuthority();
    if (pending() || typeof account !== "object" || epoch === undefined) {
      invalidate();
      return;
    }
    // A successful read remains valid while its bounded renewal is in flight.
    const current = generation;
    const controller = new AbortController();
    request = controller;
    const failed = () => {
      if (!alive || current !== generation || request !== controller) return;
      invalidate();
      renewal = setTimeout(() => {
        if (document.visibilityState !== "hidden") refresh();
      }, FRESHNESS_MS);
    };
    deadline = setTimeout(failed, REQUEST_TIMEOUT_MS);
    const client = props.client ?? createSessionApiClient();
    void client.get_rewardsQualificationPolicies(undefined, { signal: controller.signal })
      .then(() => {
        const latest = session();
        if (alive && current === generation && !controller.signal.aborted && isCurrentSessionAuthority(epoch)
          && !pending() && typeof latest === "object" && latest.userId === account.userId) {
          clearTimeout(deadline);
          request = undefined;
          clearTimeout(expiry);
          clearTimeout(renewal);
          setAvailable(true);
          expiry = setTimeout(() => {
            invalidate();
            if (document.visibilityState !== "hidden") refresh();
          }, FRESHNESS_MS);
          renewal = setTimeout(() => {
            if (document.visibilityState !== "hidden") refresh();
          }, RENEW_AFTER_MS);
        } else failed();
      }, failed);
  };

  createEffect(() => ({ account: session(), pending: pending() }), () => {
    invalidate();
    untrack(refresh);
  });
  if (typeof window !== "undefined") {
    // Refresh fences work immediately, even while the shell retains old chrome.
    onCleanup(onSessionRefreshed(invalidate));
    const focus = () => { if (!available()) refresh(); };
    window.addEventListener("focus", focus);
    onCleanup(() => window.removeEventListener("focus", focus));
  }
  onCleanup(() => {
    alive = false;
    invalidate();
  });
  return <RewardServiceAvailabilityContext value={available}>{props.children}</RewardServiceAvailabilityContext>;
}
