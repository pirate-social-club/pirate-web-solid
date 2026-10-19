import { ApiClientError, type PirateApiClient } from "@pirate/api-client";
import { createCommentNavigationReader } from "./comment-navigation-api.ts";
import { commentSelector, withCommentSelector } from "./comment-selector.ts";
import { decodePublicPostSlug, projectPublicPostResponse, publicPostIdPathFromRequest, publicPostPathFromRequest, type PublicPostRouteState } from "../posts/public-post/public-post-route.model.ts";

export type TargetedPostClient = Pick<PirateApiClient, "get_commentsCommentIdLocation" | "get_publicPostsBySlug" | "get_publicPostsByIdPostIdCanonicalRoute">;

/** Authenticated browser-only read: no private windows enter SSR or router caches. */
export async function loadTargetedPost(path: string, locale: string, canonicalOrigin: string | undefined, client: TargetedPostClient, signal: AbortSignal): Promise<PublicPostRouteState> {
  const url = new URL(path, "https://pirate.invalid"), selector = commentSelector(url.search);
  if (selector.kind !== "target") return { kind: "invalid", status: 400 };
  const request = new Request(url), idRoute = publicPostIdPathFromRequest(request), slugRoute = publicPostPathFromRequest(request);
  if (idRoute === null || (!idRoute && (!slugRoute || slugRoute.activity !== "detail"))) return { kind: "invalid", status: 400 };
  try {
    const slug = slugRoute ? decodePublicPostSlug(slugRoute.rawSlug)?.logical : undefined;
    if (!idRoute && !slug) return { kind: "invalid", status: 400 };
    // Literal alias lookup is authoritative. A 404 never falls through to ID.
    const response = idRoute
      ? await client.get_publicPostsByIdPostIdCanonicalRoute({ path: { postId: idRoute.postId }, query: { locale } }, { signal })
      : await client.get_publicPostsBySlug({ query: { slug: slug!, locale } }, { signal });
    if (signal.aborted) throw new Error("cancelled_target");
    if (response.kind === "age_locked") return { kind: "age-locked", status: 200, activity: "detail", locked: response.locked };
    if (response.post_id !== response.content.post.id || (idRoute && response.post_id !== idRoute.postId)) throw new Error("post_identity_mismatch");
    if (!["text", "song", "video"].includes(response.content.post.post_type)) return { kind: "not-found", status: 404 };
    const navigation = await createCommentNavigationReader(client)(selector.id, signal);
    if (signal.aborted) throw new Error("cancelled_target");
    if (navigation.kind === "age_locked") return { kind: "target-age-locked", status: 200 };
    const video = response.content.post.post_type === "video";
    const expectedPath = video
      ? `/post/${encodeURIComponent(response.post_id)}`
      : response.route?.canonical_path ?? navigation.post_path;
    if (navigation.post_id !== response.post_id || navigation.community_id !== response.content.post.community || navigation.post_path !== expectedPath) return { kind: "not-found", status: 404 };
    if (!video && (!navigation.post_path.startsWith("/posts/") || (slug !== undefined && decodePublicPostSlug(navigation.post_path.slice("/posts/".length))?.logical !== slug))) return { kind: "not-found", status: 404 };
    if (video && response.route !== null) throw new Error("video_metadata_invalid");
    // An authenticated navigation path can exist while public metadata is null.
    // Keep that private redirect separate from public canonical/SEO eligibility.
    if (!video && response.route === null && url.pathname !== navigation.post_path) return { kind: "redirect", status: 308, location: withCommentSelector(navigation.post_path, selector.id) };
    const projected = projectPublicPostResponse({ activity: "detail", canonicalOrigin, expectedPostId: idRoute?.postId, logicalSlug: slug, requestPath: url.pathname, response });
    if (projected.kind === "redirect") return { ...projected, location: `${projected.location}?comment=${encodeURIComponent(selector.id)}` };
    return projected.kind === "content" ? { ...projected, navigation } : projected;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return { kind: "target-sign-in", status: 200, returnPath: path };
    if (error instanceof ApiClientError && error.status === 404) return { kind: "not-found", status: 404 };
    if (error instanceof ApiClientError && error.status === 400) return { kind: "invalid", status: 400 };
    return { kind: "unavailable", status: 502 };
  }
}
