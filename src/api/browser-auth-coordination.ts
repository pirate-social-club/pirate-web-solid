import { captureSessionRevision, forgetSessionAuthority, isCurrentSessionRevision } from "./browser-session-events.ts";
import { fenceBrowserSessionResponse } from "./browser-session-response.ts";
export { SessionAuthorityChangedError } from "./browser-session-events.ts";

const CHANNEL = "pirate:browser-session:v1";
const MARKER = "pirate:browser-session-change:v1";
export const BROWSER_AUTH_CHANGE_EVENT = "pirate:browser-auth-change";
export type BrowserAuthChange = "changing" | "changed" | "logout";

export class SessionRenewalUnavailableError extends Error {
  constructor() { super("session_renewal_unavailable"); this.name = "SessionRenewalUnavailableError"; }
}

export interface BrowserSessionFence {
  readonly revision: number | undefined;
  readonly marker: string | null | undefined;
}

function marker(): string | null | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage.getItem(MARKER); }
  catch { return undefined; }
}

export function captureBrowserSessionFence(): BrowserSessionFence {
  return { revision: captureSessionRevision(), marker: marker() };
}

export function isCurrentBrowserSessionFence(fence: BrowserSessionFence): boolean {
  return isCurrentSessionRevision(fence.revision) && fence.marker === marker();
}

let channel: BroadcastChannel | undefined;
let listening = false;
let observedMarker: string | null | undefined;

function notify(kind: BrowserAuthChange): void {
  forgetSessionAuthority();
  window.dispatchEvent(new CustomEvent<BrowserAuthChange>(BROWSER_AUTH_CHANGE_EVENT, { detail: kind }));
}

/** Messages contain only a change kind and nonce, never account or credential data. */
export function observeBrowserAuthChanges(): void {
  if (typeof window === "undefined" || listening) return;
  listening = true;
  observedMarker = marker();
  const receive = (raw: unknown) => {
    if (typeof raw !== "string" || raw === observedMarker) return;
    const stored = marker();
    if (stored !== undefined && stored !== raw) return;
    try {
      const value: unknown = JSON.parse(raw);
      if (value === null || typeof value !== "object" || !("kind" in value)) return;
      if (value.kind !== "changing" && value.kind !== "changed" && value.kind !== "logout") return;
      observedMarker = raw;
      notify(value.kind);
    } catch { /* Ignore unrecognized same-origin notifications. */ }
  };
  try {
    channel = new window.BroadcastChannel(CHANNEL);
    channel.onmessage = event => receive(event.data);
  } catch { /* The storage listener remains available when channels are refused. */ }
  window.addEventListener("storage", event => {
    if (event.key === MARKER) receive(event.newValue);
  });
}

function announce(kind: BrowserAuthChange): void {
  const nonce = crypto.randomUUID();
  const value = JSON.stringify({ kind, nonce });
  // This opaque invalidation marker carries no authentication facts. It lets a
  // queued WebLock detect a change even before its channel event is delivered.
  try { window.localStorage.setItem(MARKER, value); }
  catch { /* A working channel can still carry the invalidation. */ }
  observedMarker = value;
  notify(kind);
  try { channel?.postMessage(value); }
  catch { /* The synchronous marker still fences other active tabs. */ }
}

/** A server-observed account replacement also invalidates retained projections. */
export function reportBrowserAccountChange(): void { announce("changed"); }

/** All cookie-changing requests share this lock, including explicit sign-in/out. */
export async function withBrowserAuthLock<T>(
  action: () => Promise<T>,
  signal?: AbortSignal,
  automatic = false,
): Promise<T> {
  observeBrowserAuthChanges();
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (locks === undefined) {
    // Without a cross-tab lock, an old renewal could overwrite a new login's
    // cookie. Explicit sign-in/out remains usable; automatic renewal fails closed.
    if (automatic) throw new SessionRenewalUnavailableError();
    return action();
  }
  if (automatic && marker() === undefined && channel === undefined) throw new SessionRenewalUnavailableError();
  return locks.request(CHANNEL, { mode: "exclusive", ...(signal === undefined ? {} : { signal }) }, action);
}

export async function changeBrowserAuthentication(
  kind: "changed" | "logout",
  action: () => Promise<Response>,
  signal?: AbortSignal,
): Promise<Response> {
  return withBrowserAuthLock(async () => {
    announce("changing");
    try {
      const response = await action();
      // The generated client still validates the response. A logout signal
      // must wait for its complete acknowledgement: headers alone can arrive
      // before a truncated body, which is an unconfirmed result for the caller.
      let acknowledged = response.ok;
      if (acknowledged && kind === "logout") {
        try {
          const body: unknown = await response.clone().json();
          acknowledged = body !== null && typeof body === "object" && !Array.isArray(body)
            && "status" in body && body.status === "ok" && Object.keys(body).length === 1;
        } catch { acknowledged = false; }
      }
      announce(acknowledged ? kind : "changed");
      // Capture while this mutation still owns the WebLock. An older exchange
      // or logout body cannot finish under a later login's cookie authority.
      const fence = captureBrowserSessionFence();
      return fenceBrowserSessionResponse(response, () => isCurrentBrowserSessionFence(fence));
    } catch (error) {
      // An unacknowledged mutation can have reached the server. Reread its
      // authority; do not announce a confirmed logout or clear author journals.
      announce("changed");
      throw error;
    }
  }, signal);
}
