import { query, type RouteProps } from "@solidjs/router";
import { defineFileRoute } from "@solidjs/router/fs";
import { getRequestEvent, httpHeader, httpStatus } from "@solidjs/web";

import { createPublicCommunityRouteClient } from "../../../api/community-route-client.ts";
import { createPublicHandleSalesClient } from "../../../api/handle-sales-client.ts";
import HandleStorefront from "../../../features/communities/handle-storefront/handle-storefront.tsx";
import {
  loadHandleStorefrontPublic,
  type HandleStorefrontPublicState,
} from "../../../features/communities/handle-storefront/handle-storefront.model.ts";
import { decodeCommunityRouteParam } from "../../../features/communities/community-page/community-page-preflight.ts";

function requestUrl(): URL | undefined {
  const event = getRequestEvent();
  if (event !== undefined) return new URL(event.request.url);
  return typeof location === "undefined" ? undefined : new URL(location.href);
}

function requestOrigin(): string | undefined {
  return requestUrl()?.origin;
}

function containsControlCharacter(value: string): boolean {
  return [...value].some(character => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

function boundedSearchParam(name: string): string | null {
  const value = requestUrl()?.searchParams.get(name) ?? null;
  return value !== null && value.length <= 256 && !containsControlCharacter(value)
    ? value
    : null;
}

export function commitHandleStorefrontResponse(state: HandleStorefrontPublicState): void {
  const event = getRequestEvent();
  if (event === undefined) return;
  const status = state.kind === "success"
    ? 200
    : state.kind === "invalid" ? 400 : state.kind === "not-found" ? 404 : 502;
  httpStatus(status);
  httpHeader("Cache-Control", "no-store");
  httpHeader("Vary", "Accept-Language");
}

const queryHandleStorefront = query(async (pathSegment: string) => {
  const origin = requestOrigin();
  const state = await loadHandleStorefrontPublic(
    createPublicCommunityRouteClient({ origin }),
    createPublicHandleSalesClient({ origin }),
    pathSegment,
    origin,
  );
  commitHandleStorefrontResponse(state);
  return state;
}, "community-handle-storefront");

export const route = defineFileRoute("/c/:path_segment/names", {
  preload: ({ params }) => queryHandleStorefront(decodeCommunityRouteParam(params.path_segment)),
});

export default function CommunityNamesRoute(props: RouteProps<typeof route>) {
  return <HandleStorefront
    pathSegment={props.params.path_segment}
    initialLabel={boundedSearchParam("label")}
    requestedOfferingId={boundedSearchParam("offering")}
    data={props.data}
  />;
}
