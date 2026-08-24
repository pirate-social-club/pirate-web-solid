import { getRequestEvent, httpHeader, httpStatus, renderToStream } from "@solidjs/web";
import manifest from "virtual:solid-manifest";
import App from "./App";
import Document from "./Document";
import {
  communityPageResponsePolicy,
  resolveCommunityPagePreflight,
  type CommunityPagePreflight,
} from "./features/communities/community-page/community-page-preflight.ts";
import {
  publicProfileResponsePolicy,
  resolvePublicProfilePreflight,
  type PublicProfilePreflight,
} from "./features/profiles/public-profile-page/public-profile-preflight.ts";

export async function render(
  request: Request,
  context?: { readonly clientEntry?: string; readonly API_NEXT_ORIGIN?: string },
) {
  const event = getRequestEvent();
  const nonce = event?.locals.cspNonce;
  const communityPreflight = await resolveCommunityPagePreflight(request, context?.API_NEXT_ORIGIN);
  if (communityPreflight !== undefined) {
    if (event !== undefined) {
      // SAFETY: this request-local key is written and read only as the
      // CommunityPagePreflight produced immediately above.
      const locals = event.locals as typeof event.locals & { communityPagePreflight?: CommunityPagePreflight };
      locals.communityPagePreflight = communityPreflight;
    }
    const policy = communityPageResponsePolicy(communityPreflight.state);
    httpStatus(policy.status, policy.statusText);
    policy.headers.forEach((value, name) => httpHeader(name, value));
  }
  const preflight = await resolvePublicProfilePreflight(request, context?.API_NEXT_ORIGIN);
  if (preflight !== undefined) {
    if (event !== undefined) {
      // SAFETY: this request-scoped key is written and read only as the
      // PublicProfilePreflight produced immediately above.
      const locals = event.locals as typeof event.locals & { publicProfilePreflight?: PublicProfilePreflight };
      locals.publicProfilePreflight = preflight;
    }
    const policy = publicProfileResponsePolicy(request, preflight.state);
    if (policy.status === 302) {
      return new Response(null, {
        status: policy.status,
        statusText: policy.statusText,
        headers: policy.headers,
      });
    }
    httpStatus(policy.status, policy.statusText);
    policy.headers.forEach((value, name) => httpHeader(name, value));
  }
  return renderToStream(
    () => <Document clientEntry={context?.clientEntry}><App /></Document>,
    { nonce, manifest },
  );
}
