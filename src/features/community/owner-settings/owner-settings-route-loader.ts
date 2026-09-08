import { query } from "@solidjs/router";
import { getRequestEvent, httpHeader, httpStatus } from "@solidjs/web";

import { createPublicCommunityRouteClient } from "../../../api/community-route-client";
import { createCommunityModerationSettingsApi } from "./community-moderation-settings-api";
import { createCommunityNamesSettingsApi } from "./community-names-settings-api";
import { createCommunityTelegramSettingsApi } from "./community-telegram-settings-api";
import {
  loadOwnerSettingsRoute,
  type OwnerSettingsRouteDependencies,
  type OwnerSettingsRouteState,
} from "./owner-settings-route-model";
import { communityCanonicalOrigin } from "../../communities/community-page/community-page-origin";

function requestOrigin(): string | undefined {
  const event = getRequestEvent();
  if (event !== undefined) return new URL(event.request.url).origin;
  return globalThis.location?.origin;
}

export function ownerSettingsRouteDependencies(): OwnerSettingsRouteDependencies {
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
  dependencies: OwnerSettingsRouteDependencies = ownerSettingsRouteDependencies(),
): Promise<OwnerSettingsRouteState> {
  const state = await loadOwnerSettingsRoute(rawPathSegment, dependencies, communityCanonicalOrigin());
  commitOwnerSettingsResponse(state);
  return state;
}

/** Shared by the section route and the index route so one read serves both. */
export const queryOwnerSettingsRoute = query(
  async (pathSegment: string) => preloadOwnerSettingsRoute(pathSegment),
  "community-owner-settings",
);
