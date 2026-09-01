import { query, useNavigate, type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { getRequestEvent, httpHeader, httpStatus } from "@solidjs/web";

import { createPublicCommunityRouteClient } from "../../../../api/community-route-client";
import type { ApiFetch } from "../../../../api/proxy";
import { createCommunityModerationSettingsApi } from "../../../../features/community/owner-settings/community-moderation-settings-api";
import { createCommunityNamesSettingsApi } from "../../../../features/community/owner-settings/community-names-settings-api";
import {
  loadOwnerSettingsRoute,
  type OwnerSettingsRouteDependencies,
  type OwnerSettingsRouteState,
} from "../../../../features/community/owner-settings/owner-settings-route-model";
import { OwnerSettingsRouteView } from "../../../../features/community/owner-settings/owner-settings-route-view";
import { communityCanonicalOrigin } from "../../../../features/communities/community-page/community-page-origin";
import { decodeCommunityRouteParam } from "../../../../features/communities/community-page/community-page-preflight";

function requestOrigin(): string | undefined {
  const event = getRequestEvent();
  if (event !== undefined) return new URL(event.request.url).origin;
  return globalThis.location?.origin;
}

/** Forward only the current request cookie into same-origin SSR API calls. */
export function ownerSettingsRequestFetch(request: Request, fetchImpl: ApiFetch = fetch): ApiFetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    const cookie = request.headers.get("cookie");
    if (cookie !== null) headers.set("cookie", cookie);
    return fetchImpl(input, { ...init, headers });
  };
}

function routeDependencies(): OwnerSettingsRouteDependencies {
  const event = getRequestEvent();
  const origin = requestOrigin();
  const fetchImpl = event === undefined ? undefined : ownerSettingsRequestFetch(event.request);
  return {
    communityClient: createPublicCommunityRouteClient({ fetchImpl, origin }),
    moderationApi: createCommunityModerationSettingsApi({ fetchImpl, origin }),
    namesApi: createCommunityNamesSettingsApi({ fetchImpl, origin }),
  };
}

export function commitOwnerSettingsResponse(state: OwnerSettingsRouteState): void {
  if (getRequestEvent() === undefined) return;
  const status = state.kind === "success"
    ? 200
    : state.kind === "invalid" ? 400 : state.kind === "denied" || state.kind === "not-found" ? 404 : 502;
  httpStatus(status);
  httpHeader("Cache-Control", "private, no-store");
  httpHeader("Vary", "Cookie");
}

export async function preloadOwnerSettingsRoute(
  rawPathSegment: string,
  dependencies: OwnerSettingsRouteDependencies = routeDependencies(),
): Promise<OwnerSettingsRouteState> {
  const state = await loadOwnerSettingsRoute(rawPathSegment, dependencies, communityCanonicalOrigin());
  commitOwnerSettingsResponse(state);
  return state;
}

const queryOwnerSettingsRoute = query(
  async (pathSegment: string) => preloadOwnerSettingsRoute(pathSegment),
  "community-owner-settings",
);

export const route = defineFileRoute("/c/:path_segment/settings/:section", {
  preload: ({ params }) => queryOwnerSettingsRoute(decodeCommunityRouteParam(params.path_segment)),
});

export default function CommunityOwnerSettingsRoute(props: RouteProps<typeof route>) {
  const navigate = useNavigate();
  return (
    <OwnerSettingsRouteView
      navigate={(href, options) => navigate(href, options)}
      requestedSection={props.params.section}
      state={props.data}
    />
  );
}
