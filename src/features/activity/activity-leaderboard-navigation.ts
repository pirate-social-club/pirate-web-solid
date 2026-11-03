import { decodePublicPostSlug, loadPublicPostById, loadPublicPostBySlug, publicPostIdHref, type PublicPostRouteClient, type PublicPostRouteState } from "../posts/public-post/public-post-route.model.ts";
/** Resolve song identity through the same canonical lookup as the post page. */
export async function resolveSongLeaderboardRoute(options: { readonly kind: "id" | "slug"; readonly value: string; readonly client: PublicPostRouteClient; readonly canonicalOrigin: string | undefined; readonly locale?: string; readonly returnTo?: string | null }): Promise<PublicPostRouteState> {
  const common = { activity: "detail" as const, client: options.client, canonicalOrigin: options.canonicalOrigin, locale: options.locale };
  const decoded = options.kind === "slug" ? decodePublicPostSlug(options.value) : undefined;
  if (options.kind === "slug" && !decoded) return { kind: "invalid", status: 400 };
  const state = options.kind === "id" ? await loadPublicPostById({ ...common, postId: options.value, requestPath: publicPostIdHref(options.value) }) : await loadPublicPostBySlug({ ...common, rawSlug: options.value, requestPath: `/posts/${encodeURIComponent(decoded!.logical)}` });
  return state.kind === "redirect" ? { ...state, location: leaderboardRedirectHref(`${state.location}/leaderboard`, options.returnTo ?? null) } : state;
}
export function leaderboardReturnHref(value: string | null, fallback: string): string {
  if (!value || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || /[\u0000-\u001f\u007f]/u.test(value)) return fallback;
  try {
    const url = new URL(value, "https://pirate.invalid");
    return url.origin === "https://pirate.invalid" ? url.pathname + url.search + url.hash : fallback;
  } catch { return fallback; }
}

export function leaderboardRedirectHref(location: string, from: string | null): string {
  const safe = leaderboardReturnHref(from, "");
  if (!safe) return location;
  const url = new URL(location); url.searchParams.set("from", safe); return url.toString();
}
export function leaderboardLibraryHref(destination: string): string {
  const path = leaderboardReturnHref(destination, "/songs");
  const url = new URL(path, "https://pirate.invalid"); url.searchParams.set("from", "/songs");
  return url.pathname + url.search + url.hash;
}
