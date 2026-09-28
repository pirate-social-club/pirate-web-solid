import { createSignal, onCleanup, onSettled, Show } from "solid-js";
import { buttonVariants } from "../../../design-system";
import { createSessionApiClient } from "../../../api/client.ts";
import { resolveSession, type SessionResolution } from "../../../api/session.ts";
import { viewerSessionHint } from "../../../lib/viewer-session-hint.ts";

/** The "Use this song" entry on a song post.
 *
 * A song post is the place a video to that song starts, and the song's own
 * identity is what the link must carry. This checks only the song owner's
 * derivative-video rule and video readiness. The destination chooser and
 * reservation check posting eligibility in the chosen community.
 */

export type SongVideoEligibilityReader = (input: {
  readonly communityId: string;
  readonly postId: string;
  readonly personaId?: string;
}) => Promise<boolean>;

export async function readSongVideoEligibility(input: {
  readonly communityId: string;
  readonly postId: string;
  readonly personaId?: string;
}): Promise<boolean> {
  try {
    return await readSongVideoPolicy(input);
  } catch {
    return false;
  }
}

/** Read the song policy without the destination-community membership check.
 * The private management read is available only to the song owner, and does
 * not require membership in the community where the song was posted. */
export async function readSongVideoPolicy(input: {
  readonly communityId: string;
  readonly postId: string;
  readonly personaId?: string;
}): Promise<boolean> {
  const client = createSessionApiClient();
  const path = { communityId: input.communityId, postId: input.postId };
  const response = await client.get_communitiesCommunityIdPostsPostIdOwnerPolicyPublic({
    path,
    query: {},
  });
  if (response.video_ready !== true) return false;
  if (response.derivative_video === "allowed") return true;
  if (response.derivative_video !== "owner_only" || input.personaId === undefined) return false;
  try {
    await client.get_communitiesCommunityIdPostsPostIdOwnerPolicy({ path, query: { persona_id: input.personaId } });
    return true;
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

export function songVideoEntryHref(postId: string): string {
  return `/communities?compose=video&song=${encodeURIComponent(postId)}`;
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
  const [eligible, setEligible] = createSignal(false);
  let active = true;
  onCleanup(() => { active = false; });
  // Read only after the first client render, never during server rendering.
  onSettled(() => {
    void (async () => {
      const resolved = hint() ? await session().catch(() => "anonymous" as const) : "anonymous";
      const personaId = resolved !== "anonymous" && !resolved.personasUnavailable
        ? resolved.personas[0]?.personaId
        : undefined;
      return read({ communityId: props.communityId, postId: props.postId, personaId });
    })().then(value => {
      if (active) setEligible(value);
    }, () => {
      if (active) setEligible(false);
    });
  });
  return (
    <Show when={eligible()}>
      <a class={buttonVariants({ variant: "secondary" })} href={songVideoEntryHref(props.postId)}>
        Use this song
      </a>
    </Show>
  );
}
