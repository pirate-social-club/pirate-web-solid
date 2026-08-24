import { query, type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { getRequestEvent, httpHeader, httpStatus } from "@solidjs/web";
import { createPublicCommunityRouteClient } from "../../api/community-route-client.ts";
import CommunityPage from "../../features/communities/community-page/community-page.tsx";
import {
  loadCommunityPage,
  normalizeCommunityPathSegment,
  type CommunityPageViewState,
  type CommunityRouteClient,
} from "../../features/communities/community-page/community-page.model.ts";
import {
  communityPageResponsePolicy,
  decodeCommunityRouteParam,
  type CommunityPagePreflight,
} from "../../features/communities/community-page/community-page-preflight.ts";

function requestOrigin(): string | undefined {
  const event = getRequestEvent();
  if (event !== undefined) return new URL(event.request.url).origin;
  return typeof location === "undefined" ? undefined : location.origin;
}

export function commitCommunityPageResponse(state: CommunityPageViewState): void {
  const event = getRequestEvent();
  if (event === undefined) return;
  const policy = communityPageResponsePolicy(state);
  httpStatus(policy.status, policy.statusText);
  policy.headers.forEach((value, name) => httpHeader(name, value));
}

export async function preloadCommunityPage(
  rawPathSegment: unknown,
  client: CommunityRouteClient = createPublicCommunityRouteClient({ origin: requestOrigin() }),
): Promise<CommunityPageViewState> {
  if (normalizeCommunityPathSegment(rawPathSegment) === null) {
    const state = { kind: "invalid", status: 400 } as const;
    commitCommunityPageResponse(state);
    return state;
  }
  const state = await loadCommunityPage(client, rawPathSegment);
  commitCommunityPageResponse(state);
  return state;
}

const queryCommunityPage = query(
  async (pathSegment: string) => loadCommunityPage(
    createPublicCommunityRouteClient({ origin: requestOrigin() }),
    pathSegment,
  ),
  "community-page",
);

export const route = defineFileRoute("/c/:path_segment", {
  preload: ({ params }) => {
    const decoded = decodeCommunityRouteParam(params.path_segment);
    // SAFETY: entry-server is the sole writer for this request-local key and
    // stores only a validated CommunityPagePreflight.
    const settled = getRequestEvent()?.locals.communityPagePreflight as CommunityPagePreflight | undefined;
    if (settled?.requestedPathSegment === decoded) return settled.state;
    return queryCommunityPage(decoded).then(state => {
      commitCommunityPageResponse(state);
      return state;
    });
  },
});

export default function CommunityRoute(props: RouteProps<typeof route>) {
  return <CommunityPage pathSegment={props.params.path_segment} data={props.data} />;
}
