/**
 * Where a provider (Google or X) sign-in returns once the provider sends the
 * user back to `/auth/sign-in`. A community-creation intent keeps priority;
 * otherwise the user returns to the page the sign-in started from, so a Join
 * started on a community page does not land on home.
 *
 * The return path is attacker-controllable query data, so it is accepted only
 * as a plain path on the app's own origin. Absolute and protocol-relative
 * URLs, backslash forms, control characters and `/auth/` routes fall back to
 * home.
 */

import type { OAuthProvider } from "../../api/privy-session.ts";

export const SIGN_IN_RETURN_PARAM = "return_to";

const INTENT_ID = /^[a-zA-Z0-9_-]{1,200}$/;
const MAX_RETURN_PATH_LENGTH = 2048;

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function safeReturnPath(candidate: string | null, origin: string): string | undefined {
  if (candidate === null || candidate.length === 0 || candidate.length > MAX_RETURN_PATH_LENGTH) return undefined;
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return undefined;
  if (hasControlCharacter(candidate)) return undefined;
  let resolved: URL;
  try {
    resolved = new URL(candidate, origin);
  } catch {
    return undefined;
  }
  if (resolved.origin !== new URL(origin).origin) return undefined;
  if (resolved.pathname === "/auth" || resolved.pathname.startsWith("/auth/")) return undefined;
  return `${resolved.pathname}${resolved.search}`;
}

function communityIntent(url: URL): string | undefined {
  const intentId = url.pathname === "/communities/new"
    ? url.searchParams.get("intent_id")
    : url.searchParams.get("community_intent");
  return intentId !== null && INTENT_ID.test(intentId) ? intentId : undefined;
}

/** The provider redirect target for a sign-in started at `currentHref`. */
export function oauthRedirectUrl(provider: OAuthProvider, currentHref: string): string {
  const current = new URL(currentHref);
  const redirect = new URL("/auth/sign-in", current.origin);
  redirect.searchParams.set("provider", provider);
  const intentId = communityIntent(current);
  if (intentId !== undefined) {
    redirect.searchParams.set("community_intent", intentId);
    return redirect.toString();
  }
  // A retry from the full-page sign-in route carries its validated return on.
  const returnPath = current.pathname === "/auth" || current.pathname.startsWith("/auth/")
    ? safeReturnPath(current.searchParams.get(SIGN_IN_RETURN_PARAM), current.origin)
    : safeReturnPath(`${current.pathname}${current.search}`, current.origin);
  if (returnPath !== undefined && returnPath !== "/") redirect.searchParams.set(SIGN_IN_RETURN_PARAM, returnPath);
  return redirect.toString();
}

/** Where `/auth/sign-in` sends the user after a successful provider return. */
export function signInReturnPath(href: string): string {
  const url = new URL(href);
  const intentId = url.searchParams.get("community_intent");
  if (intentId !== null && INTENT_ID.test(intentId)) return `/communities/new?intent_id=${encodeURIComponent(intentId)}`;
  return safeReturnPath(url.searchParams.get(SIGN_IN_RETURN_PARAM), url.origin) ?? "/";
}
