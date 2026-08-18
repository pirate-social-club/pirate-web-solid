import { query, useNavigate, type Navigator, type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { getRequestEvent, httpHeader, httpStatus } from "@solidjs/web";
import { createPublicApiClient } from "../../api/client.ts";
import { loadPublicProfile, normalizePirateHandle, type PublicProfileClient, type PublicProfileViewState } from "../../features/profiles/public-profile-page/public-profile-page.model.ts";
import PublicProfilePage from "../../features/profiles/public-profile-page/public-profile-page.tsx";
import {
  publicProfileResponsePolicy,
  type PublicProfilePreflight,
} from "../../features/profiles/public-profile-page/public-profile-preflight.ts";

function requestOrigin(): string | undefined {
  const event = getRequestEvent();
  if (event !== undefined) return new URL(event.request.url).origin;
  return typeof location === "undefined" ? undefined : location.origin;
}

/** Commit the complete response policy while the SSR response is still open. */
export function commitPublicProfileResponse(state: PublicProfileViewState): void {
  const event = getRequestEvent();
  if (event === undefined) return;
  const policy = publicProfileResponsePolicy(event.request, state);
  httpStatus(policy.status, policy.statusText);
  policy.headers.forEach((value, name) => httpHeader(name, value));
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

const queryPublicProfile = query(
  async (handle: string): Promise<PublicProfileViewState> => loadPublicProfile(createPublicApiClient({ origin: requestOrigin() }), handle),
  "public-profile",
);

export const route = defineFileRoute("/u/:handle", {
  preload: ({ params }) => {
    // SAFETY: entry-server is the sole writer for this request-local key and
    // stores only a validated PublicProfilePreflight.
    const settled = getRequestEvent()?.locals.publicProfilePreflight as PublicProfilePreflight | undefined;
    if (settled?.requestedHandle === params.handle) return settled.state;
    return queryPublicProfile(params.handle).then(state => {
      commitPublicProfileResponse(state);
      return state;
    });
  },
});

export default function PublicProfileRoute(props: RouteProps<typeof route>) {
  // Route navigation is available in the real file-route context. The page's
  // direct-render tests omit it and retain a small history fallback.
  const navigate: Navigator = useNavigate();
  return <PublicProfilePage handle={props.params.handle} data={props.data} navigate={navigate} />;
}
