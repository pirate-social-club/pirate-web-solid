export const SESSION_REJECTED_EVENT = "pirate:session-rejected";
export const SESSION_FENCED_EVENT = "pirate:session-fenced";

export class SessionAuthorityChangedError extends Error {
  constructor() { super("session_changed"); this.name = "SessionAuthorityChangedError"; }
}

// A page-local epoch established by a validated account read or successful
// provider exchange. It contains no credential or account-private projection.
let nextEpoch = 0;
let establishedEpoch: number | undefined;
let revision = 0;
let accountId: string | undefined;

function fence(): void {
  revision++;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_FENCED_EVENT));
}

/** Includes anonymous startup, which has no established account authority yet. */
export function captureSessionRevision(): number | undefined {
  return typeof window === "undefined" ? undefined : revision;
}

export function isCurrentSessionRevision(value: number | undefined): boolean {
  return value !== undefined && value === captureSessionRevision();
}

export function establishedSessionAccount(): string | undefined { return accountId; }

export function establishSessionAuthority(account?: string): void {
  if (typeof window === "undefined") return;
  if (account !== undefined) {
    if (accountId !== undefined && accountId !== account) replaceSessionAuthority();
    accountId = account;
  }
  if (typeof window !== "undefined" && establishedEpoch === undefined) establishedEpoch = ++nextEpoch;
}

/** A new exchange fences requests sent under the previous identity. */
export function replaceSessionAuthority(): void {
  if (typeof window !== "undefined") { establishedEpoch = ++nextEpoch; fence(); }
}

/** Fence prior reads while retaining knowledge of an established session. */
export function refreshSessionAuthority(): void {
  if (establishedEpoch !== undefined) replaceSessionAuthority();
  else fence();
}

export function forgetSessionAuthority(): void {
  establishedEpoch = undefined;
  accountId = undefined;
  fence();
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
