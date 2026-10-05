import { getRequestEvent } from "@solidjs/web";
import { platformNavigationScope, type ApplicationNavigationScope } from "./navigation-model.ts";

/** Set by entry-server from the verified ingress dispatch, never request headers. */
export function currentApplicationNavigationScope(): ApplicationNavigationScope {
  const event = getRequestEvent();
  // SAFETY: entry-server owns this optional request-local field.
  const locals = event?.locals as { verifiedCommunityAppId?: string } | undefined;
  const id = event ? locals?.verifiedCommunityAppId
    : globalThis.document?.documentElement.dataset.communityAppId;
  return id ? {
    kind: "community",
    community: { communityId: id, displayName: "Community", href: `/c/${encodeURIComponent(id)}` },
  } : platformNavigationScope;
}
