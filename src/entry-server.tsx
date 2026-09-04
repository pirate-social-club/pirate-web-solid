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
import {
  personaPublicProfileResponsePolicy,
  resolvePersonaPublicProfilePreflight,
  type PersonaPublicProfilePreflight,
} from "./features/profiles/persona-public-profile/persona-public-profile-preflight.ts";
import {
  publicPostResponsePolicy,
  resolvePublicPostPreflight,
  type PublicPostPreflight,
} from "./features/posts/public-post/public-post-preflight.ts";

export async function render(
  request: Request,
  context?: {
    readonly clientEntry?: string;
    readonly API_NEXT_ORIGIN?: string;
    readonly PERSONA_PUBLIC_PROFILE_PREFLIGHT?: PersonaPublicProfilePreflight;
    readonly CANONICAL_ASSET_ORIGIN?: string;
    readonly DISABLE_HYDRATION?: boolean;
    readonly PUBLIC_POST_PREFLIGHT?: PublicPostPreflight;
  },
) {
  const event = getRequestEvent();
  const nonce = event?.locals.cspNonce;
  // SAFETY: Vite's runtime manifest includes the `_base` member used by the
  // Solid asset resolver even though AssetManifest's public index signature
  // omits it. Every chunk record is preserved; only that resolver base changes.
  const renderManifest = (context?.CANONICAL_ASSET_ORIGIN === undefined
    ? manifest
    : { ...manifest, _base: `${new URL(context.CANONICAL_ASSET_ORIGIN).origin}/` }) as typeof manifest;
  const postPreflight = context?.PUBLIC_POST_PREFLIGHT ??
    await resolvePublicPostPreflight(request, context?.API_NEXT_ORIGIN);
  if (postPreflight !== undefined) {
    if (postPreflight.state.kind === "redirect") {
      return new Response(null, {
        status: 308,
        headers: {
          "Cache-Control": "private, no-store",
          Location: postPreflight.state.location,
          Vary: "Accept-Language, Cookie",
        },
      });
    }
    if (event !== undefined) {
      // SAFETY: this request-local key is written and read only as the
      // PublicPostPreflight produced immediately above.
      const locals = event.locals as typeof event.locals & { publicPostPreflight?: PublicPostPreflight };
      locals.publicPostPreflight = postPreflight;
    }
    const policy = publicPostResponsePolicy(postPreflight.state);
    httpStatus(policy.status, policy.statusText);
    policy.headers.forEach((value, name) => httpHeader(name, value));
  }
  const personaPreflight = context?.PERSONA_PUBLIC_PROFILE_PREFLIGHT ??
    await resolvePersonaPublicProfilePreflight(request, context?.API_NEXT_ORIGIN);
  if (personaPreflight !== undefined) {
    if (event !== undefined) {
      // SAFETY: this request-local key is written and read only as the
      // PersonaPublicProfilePreflight produced immediately above.
      const locals = event.locals as typeof event.locals & {
        personaPublicProfilePreflight?: PersonaPublicProfilePreflight;
      };
      locals.personaPublicProfilePreflight = personaPreflight;
    }
    const policy = personaPublicProfileResponsePolicy(personaPreflight.state);
    httpStatus(policy.status, policy.statusText);
    policy.headers.forEach((value, name) => httpHeader(name, value));
  }
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
    () => (
      <Document
        clientEntry={context?.clientEntry}
        canonicalAssetOrigin={context?.CANONICAL_ASSET_ORIGIN}
        hydrate={context?.DISABLE_HYDRATION !== true}
      >
        <App />
      </Document>
    ),
    { nonce, manifest: renderManifest },
  );
}
