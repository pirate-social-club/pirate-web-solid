import { isServer } from "@solidjs/web";

/** Per-tab, account-scoped presentation receipt only; no credentials or activity calendar. */
export function consumeEarnedDaySignal(accountId: string, signalId: string): boolean {
  if (isServer) return false;
  const key = `pirate:activity-earned-ui:v1:${encodeURIComponent(accountId)}:${encodeURIComponent(signalId)}`;
  try {
    if (sessionStorage.getItem(key) !== null) return false;
    sessionStorage.setItem(key, "seen");
    return true;
  } catch {
    // Without reliable UI dedupe storage, retain the recorded qualification
    // presentation and suppress a fresh-event cue, including after reload.
    return false;
  }
}
