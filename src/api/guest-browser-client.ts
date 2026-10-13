import { createPirateApiClient, type PirateApiClient, type PirateApiRequestOptions } from "@pirate/api-client";
import { createGeneratedApiClient, type ApiClientFactoryOptions } from "./client.ts";

/** Only source-admitted learning methods; accounting declarations stay unavailable. */
export type GuestBrowserGeneratedClient = Pick<PirateApiClient,
  | "get_communitiesCommunityIdPostsPostIdStudyPublic"
  | "get_guestAuthority"
  | "post_guestBootstrap"
  | "post_guestBootstrapConfirm"
  | "post_guestAuthorityRenew"
  | "post_guestCredentialsRotate"
  | "post_guestCredentialsAcknowledge"
  | "post_guestCredentialsCleanup"
  | "post_communitiesCommunityIdPostsPostIdStudyGuestV1Sessions"
  | "get_communitiesCommunityIdPostsPostIdStudyGuestV1SessionOperationsIdempotencyKey"
  | "get_communitiesCommunityIdStudyGuestV1SessionsSessionId"
  | "post_communitiesCommunityIdStudyGuestV1SessionsSessionIdItemsSessionItemIdAnswers"
  | "get_guestParticipations"
  | "put_guestLearningRetention"
  | "delete_guestLearnerAudio"
  | "post_guestAttachmentIntents"
>;

export type GuestBrowserClientOptions = Omit<ApiClientFactoryOptions, "sessionRecovery">;

/** A guest401 belongs to its original proof/lease, never account sign-in recovery. */
export function createGuestBrowserClient(options: GuestBrowserClientOptions = {}): GuestBrowserGeneratedClient {
  return createGeneratedApiClient(createPirateApiClient,
    { ...options, sessionRecovery: "none" }, { credentials: "same-origin" });
}

const GUEST_CSRF_COOKIE = "__Host-pirate_guest_csrf";
const CSRF_VALUE = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;

/** Read the separate readable CSRF cookie only. HttpOnly ownership proof stays opaque. */
export function readGuestCsrfCookie(cookieHeader?: string): string | undefined {
  const source = cookieHeader ?? (typeof document === "undefined" ? "" : document.cookie);
  if (new TextEncoder().encode(source).byteLength > 16_384) return undefined;
  let token: string | undefined;
  let found = false;
  for (const pair of source.split(";")) {
    const separator = pair.indexOf("=");
    const name = (separator < 0 ? pair : pair.slice(0, separator)).trim();
    if (name !== GUEST_CSRF_COOKIE) continue;
    if (found || separator < 0) return undefined;
    found = true;
    const value = pair.slice(separator + 1).trim();
    if (!CSRF_VALUE.test(value)) return undefined;
    token = value;
  }
  return token;
}

export function guestRequestOptions(csrfToken: string, signal?: AbortSignal): PirateApiRequestOptions {
  if (!CSRF_VALUE.test(csrfToken)) throw new Error("A valid guest CSRF token is required");
  return {
    credentials: "same-origin",
    headers: { "x-guest-csrf-token": csrfToken },
    ...(signal === undefined ? {} : { signal }),
  };
}
