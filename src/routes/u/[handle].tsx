import { useNavigate, type Navigator, type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { getRequestEvent, httpHeader, httpStatus } from "@solidjs/web";
import { createPublicApiClient } from "../../api/client.ts";
import { loadPublicProfile, normalizePirateHandle, type PublicProfileClient, type PublicProfileViewState } from "../../features/profiles/public-profile-page/public-profile-page.model.ts";
import PublicProfilePage from "../../features/profiles/public-profile-page/public-profile-page.tsx";

const PUBLIC_PROFILE_CACHE_CONTROL = "public, max-age=60, s-maxage=300";

function requestOrigin(): string | undefined {
  const event = getRequestEvent();
  if (event !== undefined) return new URL(event.request.url).origin;
  return typeof location === "undefined" ? undefined : location.origin;
}

function absolutePath(path: string): string {
  const origin = requestOrigin();
  return origin === undefined ? path : new URL(path, origin).toString();
}

/** Commit the complete response policy while the SSR response is still open. */
export function commitPublicProfileResponse(state: PublicProfileViewState): void {
  if (state.kind !== "success") {
    httpStatus(state.status, state.kind === "invalid" ? "Bad Request" : state.kind === "not-found" ? "Not Found" : "Bad Gateway");
    httpHeader("Cache-Control", "no-store");
    return;
  }

  httpStatus(state.isCanonical ? 200 : 302, state.isCanonical ? undefined : "Found");
  httpHeader("Cache-Control", PUBLIC_PROFILE_CACHE_CONTROL);
  httpHeader("Vary", "Accept-Language");
  if (!state.isCanonical) httpHeader("Location", absolutePath(state.canonicalPath));
}

/** Resolve route data before the route component can stream its document head. */
export async function preloadPublicProfile(
  rawHandle: unknown,
  client: PublicProfileClient = createPublicApiClient({ origin: requestOrigin() }),
): Promise<PublicProfileViewState> {
  // Keep malformed handles synchronous from the policy's point of view. This
  // avoids starting any API work for a request whose 400 is already known.
  if (normalizePirateHandle(rawHandle) === null) {
    const state = { kind: "invalid", status: 400 } as const;
    commitPublicProfileResponse(state);
    return state;
  }

  const state = await loadPublicProfile(client, rawHandle);
  commitPublicProfileResponse(state);
  return state;
}

export const route = defineFileRoute("/u/:handle", {
  preload: ({ params }) => preloadPublicProfile(params.handle),
});

export default function PublicProfileRoute(props: RouteProps<typeof route>) {
  // Route navigation is available in the real file-route context. The page's
  // direct-render tests omit it and retain a small history fallback.
  const navigate: Navigator = useNavigate();
  return <PublicProfilePage handle={props.params.handle} data={props.data} navigate={navigate} />;
}
