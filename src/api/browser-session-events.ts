export const SESSION_REJECTED_EVENT = "pirate:session-rejected";

// A page-local epoch established by a validated account read or successful
// provider exchange. It contains no credential or account-private projection.
let nextEpoch = 0;
let establishedEpoch: number | undefined;

export function establishSessionAuthority(): void {
  if (typeof window !== "undefined" && establishedEpoch === undefined) establishedEpoch = ++nextEpoch;
}

/** A new exchange fences requests sent under the previous identity. */
export function replaceSessionAuthority(): void {
  if (typeof window !== "undefined") establishedEpoch = ++nextEpoch;
}

/** Fence prior reads while retaining knowledge of an established session. */
export function refreshSessionAuthority(): void {
  if (establishedEpoch !== undefined) replaceSessionAuthority();
}

export function forgetSessionAuthority(): void {
  establishedEpoch = undefined;
}

export function captureSessionAuthority(): number | undefined {
  return typeof window === "undefined" ? undefined : establishedEpoch;
}

export function isCurrentSessionAuthority(epoch: number | undefined): boolean {
  return epoch !== undefined && epoch === captureSessionAuthority();
}

export function reportSessionRejection(epoch: number | undefined): void {
  if (!isCurrentSessionAuthority(epoch)) return;
  // Consume this epoch before notifying subscribers; concurrent refusals and
  // the reads started by subscribers cannot dispatch a second invalidation.
  forgetSessionAuthority();
  window.dispatchEvent(new Event(SESSION_REJECTED_EVENT));
}
