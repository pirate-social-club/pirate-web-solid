import { query, useNavigate, type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { getRequestEvent, httpHeader, httpStatus } from "@solidjs/web";

import { createPublicCommunityRouteClient } from "../../../../api/community-route-client";
import type { OwnerSettingsPreflight } from "../../../../features/community/owner-settings/owner-settings-preflight";
import { createCommunityModerationSettingsApi } from "../../../../features/community/owner-settings/community-moderation-settings-api";
import { createCommunityNamesSettingsApi } from "../../../../features/community/owner-settings/community-names-settings-api";
import { createCommunityTelegramSettingsApi } from "../../../../features/community/owner-settings/community-telegram-settings-api";
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

function routeDependencies(): OwnerSettingsRouteDependencies {
  const origin = requestOrigin();
  return {
    communityClient: createPublicCommunityRouteClient({ origin }),
    moderationApi: createCommunityModerationSettingsApi({ origin }),
    namesApi: createCommunityNamesSettingsApi({ origin }),
    telegramApi: createCommunityTelegramSettingsApi({ origin }),
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
  preload: ({ params }) => {
    const decoded = decodeCommunityRouteParam(params.path_segment);
    // SAFETY: entry-server writes this request-local key only after validated API reads.
    const settled = getRequestEvent()?.locals.ownerSettingsPreflight as OwnerSettingsPreflight | undefined;
    if (settled?.requestedPathSegment === decoded) return settled.state;
    return queryOwnerSettingsRoute(decoded);
  },
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
