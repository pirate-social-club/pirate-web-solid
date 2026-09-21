import { getRequestEvent } from "@solidjs/web";

export const COMMUNITY_CREATION_AVATAR_STAGING_ORIGIN =
  "https://web-next-staging.pirate.sc" as const;

export function communityCreationAvatarAuthoringEnabled(
  configured: boolean,
  requestOrigin: string | undefined,
  canonicalOrigin: string | undefined,
): boolean {
  return configured &&
    requestOrigin === COMMUNITY_CREATION_AVATAR_STAGING_ORIGIN &&
    canonicalOrigin === COMMUNITY_CREATION_AVATAR_STAGING_ORIGIN;
}

export function currentCommunityCreationAvatarAuthoringEnabled(): boolean {
  const event = getRequestEvent();
  if (event !== undefined) {
    // SAFETY: entry-server is the sole writer for this request-local key and
    // stores only the optional canonical-origin string from the Worker context.
    const locals = event.locals as typeof event.locals & {
      communityCreationAvatarAuthoring?: boolean;
      publicAppCanonicalOrigin?: string;
    };
    return communityCreationAvatarAuthoringEnabled(
      locals.communityCreationAvatarAuthoring === true,
      new URL(event.request.url).origin,
      locals.publicAppCanonicalOrigin,
    );
  }
  const browserLocation = globalThis.window?.location;
  const browserDocument = globalThis.window?.document;
  if (browserLocation === undefined || browserDocument === undefined) return false;
  return communityCreationAvatarAuthoringEnabled(
    browserDocument.documentElement.dataset.communityCreationAvatarAuthoring === "enabled",
    browserLocation.origin,
    browserDocument.documentElement.dataset.publicAppCanonicalOrigin,
  );
}
