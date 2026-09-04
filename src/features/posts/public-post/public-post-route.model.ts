import type {
  GetPublicPostsBySlugResponse,
  PirateApiClient,
} from "@pirate/api-client";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type PublicPostActivity = "detail" | "study" | "karaoke" | "karaoke-leaderboard";
export type PublicPostRouteClient = Pick<
  PirateApiClient,
  "get_publicPostsBySlug" | "get_publicPostsByIdPostIdCanonicalRoute"
>;
export type PublicPostContentResponse = Extract<GetPublicPostsBySlugResponse, { readonly kind: "content" }>;

export type PublicPostRouteState =
  | Readonly<{
      readonly kind: "content";
      readonly status: 200;
      readonly activity: PublicPostActivity;
      readonly response: PublicPostContentResponse;
      readonly canonicalPath: string | null;
      readonly canonicalUrl: string | null;
    }>
  | Readonly<{
      readonly kind: "age-locked";
      readonly status: 200;
      readonly activity: PublicPostActivity;
      readonly locked: Extract<GetPublicPostsBySlugResponse, { readonly kind: "age_locked" }>["locked"];
    }>
  | Readonly<{ readonly kind: "redirect"; readonly status: 308; readonly location: string }>
  | Readonly<{ readonly kind: "invalid"; readonly status: 400 }>
  | Readonly<{ readonly kind: "method-not-allowed"; readonly status: 405 }>
  | Readonly<{ readonly kind: "not-found"; readonly status: 404 }>
  | Readonly<{ readonly kind: "unavailable"; readonly status: 502 }>;

export type DecodedPostSlug = Readonly<{
  readonly logical: string;
  readonly raw: string;
}>;

export function validatePublicAppOrigin(value: string | undefined): URL {
  if (value === undefined || value.trim() !== value || value === "") {
    throw new TypeError("PUBLIC_APP_CANONICAL_ORIGIN is missing");
  }
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new TypeError("PUBLIC_APP_CANONICAL_ORIGIN is not a URL");
  }
  if (
    (origin.protocol !== "https:" &&
      !(origin.protocol === "http:" && LOOPBACK_HOSTNAMES.has(origin.hostname))) ||
    origin.username !== "" ||
    origin.password !== "" ||
    origin.pathname !== "/" ||
    origin.search !== "" ||
    origin.hash !== ""
  ) {
    throw new TypeError("PUBLIC_APP_CANONICAL_ORIGIN must be an origin");
  }
  return origin;
}

function forbiddenLogicalSlug(value: string): boolean {
  return value === "" || value === "." || value === ".." || /[%/\\?#]/u.test(value);
}

/** Decode one raw URL path segment with strict escapes and strict UTF-8. */
export function decodePublicPostSlug(raw: unknown): DecodedPostSlug | null {
  if (typeof raw !== "string" || raw === "") return null;
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] !== "%") continue;
    if (!/^[0-9A-Fa-f]{2}$/u.test(raw.slice(index + 1, index + 3))) return null;
    index += 2;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (forbiddenLogicalSlug(decoded)) return null;
  const logical = decoded.normalize("NFKC");
  return forbiddenLogicalSlug(logical) ? null : { logical, raw };
}

export function logicalSlugFromCanonicalPublicPostPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^\/posts\/([^/]+)$/u.exec(value);
  if (match?.[1] === undefined) return null;
  const decoded = decodePublicPostSlug(match[1]);
  if (decoded === null) return null;
  try {
    return decodeURIComponent(match[1]) === decoded.logical ? decoded.logical : null;
  } catch {
    return null;
  }
}

export function publicPostPathFromRequest(request: Request): Readonly<{
  readonly activity: PublicPostActivity;
  readonly rawSlug: string;
}> | undefined {
  const match = /^\/posts\/([^/]+)(?:\/(study|karaoke(?:\/leaderboard)?))?\/?$/iu.exec(
    new URL(request.url).pathname,
  );
  if (match?.[1] === undefined) return undefined;
  const suffix = match[2]?.toLowerCase();
  const activity = suffix === "study"
    ? "study"
    : suffix === "karaoke" ? "karaoke"
      : suffix === "karaoke/leaderboard" ? "karaoke-leaderboard"
        : "detail";
  return { activity, rawSlug: match[1] };
}

export function legacyPublicPostPathFromRequest(request: Request): Readonly<{
  readonly activity: Exclude<PublicPostActivity, "detail">;
  readonly postId: string;
}> | undefined | null {
  const match = /^\/p\/([^/]+)\/(study|karaoke(?:\/leaderboard)?)\/?$/iu.exec(new URL(request.url).pathname);
  if (match?.[1] === undefined) return undefined;
  let postId: string;
  try {
    postId = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  if (postId === "" || /[%/\\]/u.test(postId)) return null;
  return {
    activity: match[2]?.toLowerCase() === "study"
      ? "study"
      : match[2]?.toLowerCase() === "karaoke" ? "karaoke" : "karaoke-leaderboard",
    postId,
  };
}

function activityPath(
  route: NonNullable<PublicPostContentResponse["route"]>,
  activity: PublicPostActivity,
): string {
  if (activity === "detail") return route.canonical_path;
  if (activity === "study") return route.activity_paths.study;
  if (activity === "karaoke") return route.activity_paths.karaoke;
  return route.activity_paths.karaoke_leaderboard;
}

function validatedCanonicalPath(
  route: NonNullable<PublicPostContentResponse["route"]>,
  activity: PublicPostActivity,
): string | null {
  if (logicalSlugFromCanonicalPublicPostPath(route.canonical_path) === null) return null;
  if (
    route.activity_paths.study !== `${route.canonical_path}/study` ||
    route.activity_paths.karaoke !== `${route.canonical_path}/karaoke` ||
    route.activity_paths.karaoke_leaderboard !== `${route.canonical_path}/karaoke/leaderboard`
  ) return null;
  return activityPath(route, activity);
}

export function projectPublicPostResponse(options: Readonly<{
  readonly activity: PublicPostActivity;
  readonly canonicalOrigin: string | undefined;
  readonly expectedPostId?: string;
  readonly logicalSlug?: string;
  readonly requestPath: string;
  readonly response: GetPublicPostsBySlugResponse;
}>): PublicPostRouteState {
  if (options.response.kind === "age_locked") {
    return { kind: "age-locked", status: 200, activity: options.activity, locked: options.response.locked };
  }
  if (
    options.response.post_id !== options.response.content.post.id ||
    (options.expectedPostId !== undefined && options.response.post_id !== options.expectedPostId)
  ) return { kind: "unavailable", status: 502 };

  const route = options.response.route;
  if (route === null) {
    return {
      kind: "content",
      status: 200,
      activity: options.activity,
      response: options.response,
      canonicalPath: null,
      canonicalUrl: null,
    };
  }
  const target = validatedCanonicalPath(route, options.activity);
  const canonicalLogicalSlug = logicalSlugFromCanonicalPublicPostPath(route.canonical_path);
  if (
    target === null ||
    canonicalLogicalSlug === null ||
    (options.logicalSlug !== undefined && canonicalLogicalSlug !== options.logicalSlug)
  ) return { kind: "unavailable", status: 502 };

  let canonicalOrigin: URL;
  try {
    canonicalOrigin = validatePublicAppOrigin(options.canonicalOrigin);
  } catch {
    return { kind: "unavailable", status: 502 };
  }

  if (options.requestPath !== target) {
    return { kind: "redirect", status: 308, location: new URL(target, canonicalOrigin).toString() };
  }
  return {
    kind: "content",
    status: 200,
    activity: options.activity,
    response: options.response,
    canonicalPath: route.canonical_path,
    canonicalUrl: new URL(route.canonical_path, canonicalOrigin).toString(),
  };
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  // SAFETY: the `in` guard establishes an object carrying only an unknown
  // status field, which is validated immediately below.
  const status = (error as { readonly status?: unknown }).status;
  return typeof status === "number" && Number.isInteger(status) ? status : undefined;
}

function mapLookupError(error: unknown): PublicPostRouteState {
  const status = errorStatus(error);
  if (status === 400) return { kind: "invalid", status: 400 };
  if (status === 404) return { kind: "not-found", status: 404 };
  return { kind: "unavailable", status: 502 };
}

export async function loadPublicPostBySlug(options: Readonly<{
  readonly activity: PublicPostActivity;
  readonly canonicalOrigin: string | undefined;
  readonly client: PublicPostRouteClient;
  readonly locale?: string;
  readonly rawSlug: unknown;
  readonly requestPath: string;
}>): Promise<PublicPostRouteState> {
  const decoded = decodePublicPostSlug(options.rawSlug);
  if (decoded === null) return { kind: "invalid", status: 400 };
  try {
    const response = await options.client.get_publicPostsBySlug({
      query: { slug: decoded.logical, ...(options.locale === undefined ? {} : { locale: options.locale }) },
    });
    return projectPublicPostResponse({
      activity: options.activity,
      canonicalOrigin: options.canonicalOrigin,
      logicalSlug: decoded.logical,
      requestPath: options.requestPath,
      response,
    });
  } catch (error: unknown) {
    return mapLookupError(error);
  }
}

export async function loadPublicPostById(options: Readonly<{
  readonly activity: Exclude<PublicPostActivity, "detail">;
  readonly canonicalOrigin: string | undefined;
  readonly client: PublicPostRouteClient;
  readonly locale?: string;
  readonly postId: string;
  readonly requestPath: string;
}>): Promise<PublicPostRouteState> {
  try {
    const response = await options.client.get_publicPostsByIdPostIdCanonicalRoute({
      path: { postId: options.postId },
      query: options.locale === undefined ? undefined : { locale: options.locale },
    });
    return projectPublicPostResponse({
      activity: options.activity,
      canonicalOrigin: options.canonicalOrigin,
      expectedPostId: options.postId,
      requestPath: options.requestPath,
      response,
    });
  } catch (error: unknown) {
    return mapLookupError(error);
  }
}
