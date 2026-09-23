import { createSignal, onCleanup, onSettled, Show } from "solid-js";
import { buttonVariants } from "../../../design-system";
import { createSessionApiClient } from "../../../api/client.ts";
import { resolveSession, type SessionResolution } from "../../../api/session.ts";
import { viewerSessionHint } from "../../../lib/viewer-session-hint.ts";
import { communityOperationPersonas } from "../../identity/community-persona-choice.ts";
import { useActivePersonaStoreOptional } from "../../identity/active-persona-store.tsx";

/** The "Use this song" entry on a song post.
 *
 * A song post is the place a video to that song starts, and the song's own
 * identity is what the link must carry. Whether this viewer may post a video
 * to this song is the server's public owner-policy answer, read per song and
 * never assumed from the post being visible; the entry is simply absent when
 * the answer is no or cannot be read. A signed-out viewer has no session to
 * post under, so the read is not even attempted for them.
 */

export type SongVideoEligibilityReader = (input: {
  readonly communityId: string;
  readonly postId: string;
  readonly personaId: string;
}) => Promise<boolean>;

export async function readSongVideoEligibility(input: {
  readonly communityId: string;
  readonly postId: string;
  readonly personaId: string;
}): Promise<boolean> {
  try {
    const response = await createSessionApiClient().get_communitiesCommunityIdPostsPostIdOwnerPolicyPublic({
      path: { communityId: input.communityId, postId: input.postId },
      query: { persona_id: input.personaId },
    });
    return response.can_post_with_song === true;
  } catch {
    return false;
  }
}

/** The "Use this song" entry names its song in the query, because a link must
 * carry the song's authoritative identity into the composer. Only the exact
 * compose marker with one non-empty song id is accepted. */
export function initialVideoSongFromSearch(
  search: Record<string, string | string[] | undefined>,
): { readonly postId: string } | undefined {
  if (search.compose !== "video") return undefined;
  const song = Array.isArray(search.song) ? search.song[0] : search.song;
  return typeof song === "string" && song.trim() !== "" ? { postId: song.trim() } : undefined;
}

export function songVideoEntryHref(communityId: string, postId: string): string {
  return `/c/${encodeURIComponent(communityId)}?compose=video&song=${encodeURIComponent(postId)}`;
}

export function SongVideoEntry(props: {
  readonly communityId: string;
  readonly postId: string;
  readonly read?: SongVideoEligibilityReader;
  readonly sessionHint?: () => boolean;
  readonly resolveSession?: () => Promise<SessionResolution>;
}) {
  const read = props.read ?? readSongVideoEligibility;
  const hint = props.sessionHint ?? viewerSessionHint;
  const session = props.resolveSession ?? resolveSession;
  const personaStore = useActivePersonaStoreOptional();
  const [eligible, setEligible] = createSignal(false);
  let active = true;
  onCleanup(() => { active = false; });
  // After the first render: a server render has no session to read for and
  // must not start a credentialed request.
  onSettled(() => {
    if (!hint()) return;
    void session().then(async resolved => {
      if (resolved === "anonymous" || resolved.personasUnavailable) return false;
      const candidates = communityOperationPersonas(resolved.personas, props.communityId);
      const selectedId = personaStore?.activePersonaId(props.communityId);
      const selected = candidates.find(persona => persona.personaId === selectedId);
      // A selected persona is the author the composer will use. Without a
      // selection, any bound persona can open the composer and choose there.
      for (const persona of selected === undefined ? candidates : [selected]) {
        if (await read({ communityId: props.communityId, postId: props.postId, personaId: persona.personaId })) return true;
      }
      return false;
    }).then(value => {
      if (active) setEligible(value);
    }, () => {
      if (active) setEligible(false);
    });
  });
  return (
    <Show when={eligible()}>
      <a class={buttonVariants({ variant: "secondary" })} href={songVideoEntryHref(props.communityId, props.postId)}>
        Use this song
      </a>
    </Show>
  );
}
