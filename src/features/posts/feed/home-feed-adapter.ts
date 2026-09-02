import {
  createPirateApiClient,
  type GetHomeFeedResponse,
  type PirateApiClient,
} from "@pirate/api-client";
import { createGeneratedApiClient } from "../../../api/client.ts";
import type { ApiFetch } from "../../../api/proxy.ts";
import { resolveLocaleLanguageTag, type UiLocaleCode } from "../../../lib/ui-locale-core.ts";
import type { FeedSort } from "./feed-model.ts";
import {
  normalizeFeedPage,
  type FeedPage,
} from "./public-feed-adapter.ts";

export type HomeFeedClient = Pick<PirateApiClient, "get_feedHome">;

export interface HomeFeedRequestOptions {
  readonly client?: HomeFeedClient;
  readonly cursor?: string | null;
  readonly locale?: UiLocaleCode;
  readonly sort?: FeedSort;
  readonly timeRange?: "hour" | "day" | "week" | "month" | "year" | "all";
  readonly request?: Request;
  readonly origin?: string | URL;
  readonly fetchImpl?: ApiFetch;
  readonly timeoutMs?: number;
}

function resolveRequestOrigin(options: Pick<HomeFeedRequestOptions, "origin" | "request">): string | URL | undefined {
  if (options.origin !== undefined) return options.origin;
  if (options.request !== undefined) return new URL(options.request.url).origin;
  return typeof location === "undefined" ? undefined : location.origin;
}

function boundedFetch(fetchImpl: ApiFetch, timeoutMs: number): ApiFetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Fetches the authenticated home operation with the host-only session cookie. */
export async function fetchHomeFeedPage(options: HomeFeedRequestOptions = {}): Promise<FeedPage> {
  const locale = options.locale ?? "en";
  type HomeFeedQuery = NonNullable<Parameters<HomeFeedClient["get_feedHome"]>[0]["query"]>;
  const query: HomeFeedQuery = {
    locale: resolveLocaleLanguageTag(locale),
    sort: options.sort ?? "best",
    ...(options.cursor ? { cursor: options.cursor } : {}),
    ...(options.timeRange ? { time_range: options.timeRange } : {}),
  };

  const client = options.client ?? createGeneratedApiClient(
    createPirateApiClient,
    {
      origin: resolveRequestOrigin(options),
      fetchImpl: boundedFetch(options.fetchImpl ?? fetch, options.timeoutMs ?? 4_000),
    },
    { credentials: "same-origin" },
  );
  const response: GetHomeFeedResponse = await client.get_feedHome({ query });
  return normalizeFeedPage(response);
}
