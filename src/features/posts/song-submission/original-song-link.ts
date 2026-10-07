import type { PirateApiClient } from "@pirate/api-client";
import { createApiClient } from "../../../api/client";

/** Resolves a published song link before the existing server reference check. */
export async function originalSongPostId(link: string, signal?: AbortSignal, api: Pick<PirateApiClient, "get_publicPostsBySlug" | "get_publicPostsByIdPostIdCanonicalRoute"> = createApiClient()): Promise<string> {
  const url = new URL(link.trim(), window.location.origin);
  if (url.origin !== window.location.origin || url.search || url.hash) throw new Error("Paste a song link from this Pirate site.");
  const match = /^\/posts\/([^/]+)\/?$/u.exec(url.pathname);
  if (match?.[1] === undefined) throw new Error("Paste the link to the original song's post.");
  const identifier = decodeURIComponent(match[1]);
  const options = { credentials: "same-origin" as const, ...(signal === undefined ? {} : { signal }) };
  const result = identifier.startsWith("post_")
    ? await api.get_publicPostsByIdPostIdCanonicalRoute({ path: { postId: identifier } }, options)
    : await api.get_publicPostsBySlug({ query: { slug: identifier } }, options);
  if (result.kind !== "content" || result.content.post.post_type !== "song" || result.content.post.status !== "published") {
    throw new Error("That song isn't available to select. Open its post and check the link.");
  }
  return result.post_id;
}
