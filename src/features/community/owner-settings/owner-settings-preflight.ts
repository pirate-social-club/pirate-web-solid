import { createPublicCommunityRouteClient } from "../../../api/community-route-client";
import { proxyApiRequest, type ApiFetch } from "../../../api/proxy";
import { decodeCommunityRouteParam } from "../../communities/community-page/community-page-preflight";
import { createCommunityModerationSettingsApi } from "./community-moderation-settings-api";
import { createCommunityNamesSettingsApi } from "./community-names-settings-api";
import { createCommunityTelegramSettingsApi } from "./community-telegram-settings-api";
import { loadOwnerSettingsRoute, type OwnerSettingsRouteState } from "./owner-settings-route-model";

export interface OwnerSettingsPreflight {
  requestedPathSegment: string;
  state: OwnerSettingsRouteState;
}

/** SSR invokes the owned proxy directly, without fetching the frontend Worker itself. */
export async function resolveOwnerSettingsPreflight(
  request: Request,
  apiNextOrigin: string | undefined,
  fetchImpl: ApiFetch = fetch,
): Promise<OwnerSettingsPreflight | undefined> {
  const url = new URL(request.url);
  const match = /^\/c\/([^/]+)\/settings\/[^/]+$/u.exec(url.pathname);
  if (!match?.[1]) return undefined;
  const requestedPathSegment = decodeCommunityRouteParam(match[1]);
  const serverFetch: ApiFetch = (input, init) => {
    const outgoing = new Request(input, init);
    if (new URL(outgoing.url).origin !== url.origin || outgoing.method !== "GET") {
      throw new Error("Invalid settings read");
    }
    const headers = new Headers({ accept: "application/json" });
    const cookie = request.headers.get("cookie");
    // Workers Request does not retain the browser credentials property.
    // Use the explicit generated-client option and default to no credentials.
    if (init?.credentials === "same-origin" && cookie !== null) headers.set("cookie", cookie);
    return proxyApiRequest(new Request(outgoing, { headers, signal: request.signal }),
      { API_NEXT_ORIGIN: apiNextOrigin }, { fetchImpl });
  };
  const options = { origin: url.origin, fetchImpl: serverFetch };
  return {
    requestedPathSegment,
    state: await loadOwnerSettingsRoute(requestedPathSegment, {
      communityClient: createPublicCommunityRouteClient(options),
      moderationApi: createCommunityModerationSettingsApi(options),
      namesApi: createCommunityNamesSettingsApi(options),
      telegramApi: createCommunityTelegramSettingsApi(options),
    }, url.origin),
  };
}

export function ownerSettingsResponseStatus(state: OwnerSettingsRouteState): number {
  return state.kind === "success" ? 200 : state.kind === "invalid" ? 400
    : state.kind === "denied" || state.kind === "not-found" ? 404 : 502;
}
