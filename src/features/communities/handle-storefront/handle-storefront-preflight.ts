import { createPirateApiClient, type PirateApiClientOptions } from "@pirate/api-client";

import { validateApiNextOrigin } from "../../../api/origin.ts";
import type { ApiFetch } from "../../../api/proxy.ts";
import { decodeCommunityRouteParam } from "../community-page/community-page-preflight.ts";
import { normalizeCommunityPathSegment } from "../community-page/community-page.model.ts";
import {
  loadHandleStorefrontPublic,
  type HandleStorefrontPublicState,
} from "./handle-storefront.model.ts";

export type HandleStorefrontPreflight = Readonly<{
  readonly requestedPathSegment: string;
  readonly state: HandleStorefrontPublicState;
}>;

export type HandleStorefrontResponsePolicy = Readonly<{
  readonly status: 200 | 400 | 404 | 502;
  readonly statusText?: string;
  readonly headers: Headers;
}>;

export function handleStorefrontPathSegmentFromRequest(request: Request): string | undefined {
  const match = /^\/c\/([^/]+)\/names$/u.exec(new URL(request.url).pathname);
  return match?.[1] === undefined ? undefined : decodeCommunityRouteParam(match[1]);
}

export async function resolveHandleStorefrontPreflight(
  request: Request,
  apiNextOrigin: string | undefined,
  fetchImpl: ApiFetch = fetch,
): Promise<HandleStorefrontPreflight | undefined> {
  const requestedPathSegment = handleStorefrontPathSegmentFromRequest(request);
  if (requestedPathSegment === undefined) return undefined;
  if (normalizeCommunityPathSegment(requestedPathSegment) === null) {
    return { requestedPathSegment, state: { kind: "invalid", status: 400 } };
  }

  let origin: URL;
  try {
    origin = validateApiNextOrigin(apiNextOrigin);
  } catch {
    return { requestedPathSegment, state: { kind: "unavailable", status: 502 } };
  }

  const options: PirateApiClientOptions = {
    credentials: "omit",
    signal: request.signal,
    // SAFETY: ApiFetch has the generated client's standard fetch call shape.
    fetchImpl: fetchImpl as typeof fetch,
  };
  const client = createPirateApiClient(`${origin.origin}/`, options);
  const state = await loadHandleStorefrontPublic(
    client,
    client,
    requestedPathSegment,
    new URL(request.url).origin,
  );
  return { requestedPathSegment, state };
}

export function handleStorefrontResponsePolicy(state: HandleStorefrontPublicState): HandleStorefrontResponsePolicy {
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Accept-Language",
  });
  if (state.kind === "success") return { status: 200, headers };
  if (state.kind === "invalid") return { status: 400, statusText: "Bad Request", headers };
  if (state.kind === "not-found") return { status: 404, statusText: "Not Found", headers };
  return { status: 502, statusText: "Bad Gateway", headers };
}
