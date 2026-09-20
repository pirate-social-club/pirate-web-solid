import { createSessionApiClient } from "../../../api/client.ts";

/** The song a video was published to, as the server projects it.
 *
 * The projection carries the song's post id, its title and its author's
 * persona id. It is read from the video envelope exactly as projected and
 * never inferred from a capture-recognition verdict, so a feed card can name
 * the song without another contract change.
 */
export interface SongAttribution {
  readonly songPostId: string;
  readonly title: string;
  readonly songAuthorPersonaId: string;
}

/** What a surface may know about the song before the post read answers: at
 * minimum the id, and the projected title when the surface has it. */
export interface SongAttributionRef {
  readonly songPostId: string;
  readonly title?: string;
  readonly songAuthorPersonaId?: string;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { readonly [key: string]: JsonValue };

function isRecord(value: unknown): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.trim() === value ? value : null;
}

/** Reads the song reference out of a projected video envelope. A video with
 * its own sound, a malformed soundtrack or a song missing any of its three
 * facts has no attribution to show. */
export function readSongAttribution(video: unknown): SongAttribution | null {
  if (!isRecord(video) || video.track !== "video") return null;
  const soundtrack = video.soundtrack;
  if (!isRecord(soundtrack) || soundtrack.kind !== "song_reference") return null;
  const reference = soundtrack.song_reference;
  if (!isRecord(reference)) return null;
  const songPostId = requiredText(reference.song_post_id);
  const title = requiredText(reference.song_title);
  const songAuthorPersonaId = requiredText(reference.song_author_persona_id);
  if (songPostId === null || title === null || songAuthorPersonaId === null) return null;
  return { songPostId, title, songAuthorPersonaId };
}

export interface SongAttributionLink {
  readonly href: string;
  readonly title: string | null;
  readonly authorName: string | null;
}

export type SongAttributionLinkResolver = (
  attribution: SongAttributionRef,
) => Promise<SongAttributionLink | null>;

/** The slice of the public post read this chip needs. Kept structural so the
 * generated client and a test double are both valid. */
export interface SongAttributionPostRead {
  readonly kind: "content" | "age_locked";
  readonly post_id?: string;
  readonly content?: {
    readonly post: {
      readonly song_title?: string | null;
      readonly title?: string | null;
      readonly author_persona?: {
        readonly display_name?: string | null;
        readonly primary_public_handle?: string | null;
      } | null;
    };
  };
  readonly route?: { readonly canonical_path: string } | null;
}

export interface SongAttributionClient {
  readonly get_publicPostsByIdPostIdCanonicalRoute: (input: {
    readonly path: { readonly postId: string };
  }) => Promise<SongAttributionPostRead>;
}

/** Resolves a song post's canonical page and author name for the chip.
 *
 * The projection names the song by id; the readable link is its canonical
 * path, which only the public post read answers. One read per song is cached
 * for the session, including a failed answer, so a feed with many videos to
 * the same song does not repeat it. A song with no canonical route, or a read
 * that fails, yields no link; the chip then shows the title as plain text
 * rather than inventing an address. */
export function createSongAttributionLinkResolver(
  options: {
    readonly client?: SongAttributionClient;
    readonly cache?: Map<string, Promise<SongAttributionLink | null>>;
  } = {},
): SongAttributionLinkResolver {
  const cache = options.cache ?? new Map<string, Promise<SongAttributionLink | null>>();
  const client = options.client;
  return (attribution) => {
    const cached = cache.get(attribution.songPostId);
    if (cached) return cached;
    const pending = (async (): Promise<SongAttributionLink | null> => {
      try {
        const response = await (client ?? createSessionApiClient())
          .get_publicPostsByIdPostIdCanonicalRoute({ path: { postId: attribution.songPostId } });
        if (response.kind !== "content" || response.content === undefined || response.route == null) return null;
        const post = response.content.post;
        const persona = post.author_persona;
        const title = post.song_title?.trim() || post.title?.trim() || null;
        const authorName = persona?.display_name?.trim() || persona?.primary_public_handle?.trim() || null;
        return { href: response.route.canonical_path, title, authorName };
      } catch {
        return null;
      }
    })();
    cache.set(attribution.songPostId, pending);
    return pending;
  };
}
