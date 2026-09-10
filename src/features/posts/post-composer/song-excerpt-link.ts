/** Turning a pasted song link into the post it names.
 *
 * A link is the temporary way to choose a song, because no catalogue operation
 * exists yet: the community reads expose text and video surfaces and there is
 * no song listing to browse. When one lands, this becomes one of two ways in
 * rather than the only one.
 *
 * Only the post-id form is resolvable here. `getPayload` takes a post id and
 * looks the community up itself, so `/p/<postId>` and a bare id both work. A
 * `/posts/<slug>` link names a post by slug, which is a different lookup that
 * this increment does not do — it is reported as unsupported rather than
 * guessed at, because guessing would produce a confident failure later.
 */
export type SongLinkResult =
  | { readonly kind: "post"; readonly postId: string }
  | { readonly kind: "unsupported"; readonly reason: string };

const POST_ID = /^[A-Za-z0-9_-]{6,64}$/u;

function fromPathname(pathname: string): SongLinkResult | null {
  const segments = pathname.split("/").filter(Boolean);
  const legacy = segments.indexOf("p");
  if (legacy >= 0 && segments[legacy + 1] && POST_ID.test(segments[legacy + 1])) {
    return { kind: "post", postId: segments[legacy + 1] };
  }
  if (segments.includes("posts")) {
    return {
      kind: "unsupported",
      reason: "That link names a post by slug. Paste a /p/<post id> link or the post id itself.",
    };
  }
  return null;
}

export function parseSongLink(value: string): SongLinkResult {
  const trimmed = value.trim();
  if (!trimmed) return { kind: "unsupported", reason: "Paste a song link or post id." };
  if (POST_ID.test(trimmed) && !trimmed.includes("/")) {
    return { kind: "post", postId: trimmed };
  }
  // A bare path has no host to borrow, so it is read as a path directly rather
  // than being forced through a URL with an empty authority.
  if (trimmed.startsWith("/")) {
    return (
      fromPathname(trimmed) ?? {
        kind: "unsupported",
        reason: "No post id in that path. Paste a /p/<post id> link or the post id itself.",
      }
    );
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  let pathname: string;
  try {
    pathname = new URL(withScheme).pathname;
  } catch {
    return { kind: "unsupported", reason: "That does not look like a link or a post id." };
  }
  return (
    fromPathname(pathname) ?? {
      kind: "unsupported",
      reason: "No post id in that link. Paste a /p/<post id> link or the post id itself.",
    }
  );
}
