import type { PirateApiClient } from "@pirate/api-client";
import { captureSessionAuthority, isCurrentSessionAuthority } from "../../api/browser-session-events";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions } from "../../api/client";
import { projectVideoDelivery, type VideoDeliveryState } from "../posts/video-submission/delivery-state";

type Client = Pick<PirateApiClient, "get_usersMe" | "get_personas" | "get_postsPostId"
  | "post_communitiesCommunityIdPostsPostIdDanceModeratedReferences"
  | "get_communitiesCommunityIdPostsPostIdDanceModeratedReferencesChoreographyId">;
export type DanceReferenceCommand = Parameters<Client["post_communitiesCommunityIdPostsPostIdDanceModeratedReferences"]>[0]["body"];
export type DanceReferenceStatus = Awaited<ReturnType<Client["get_communitiesCommunityIdPostsPostIdDanceModeratedReferencesChoreographyId"]>>;
export interface DanceReferenceScope {
  readonly accountId: string;
  readonly communityId: string;
  readonly postId: string;
  readonly referenceCommunityId: string;
  readonly referencePostId: string;
  readonly authorPersonaId: string;
}
export interface DanceReferenceTarget {
  readonly scope: DanceReferenceScope;
  readonly songTitle: string;
  readonly playable: boolean;
  readonly delivery: VideoDeliveryState;
}
export const danceReferencePath = (postId: string) => `/dance/new/${encodeURIComponent(postId)}`;
export const danceReferenceIdentity = (s: DanceReferenceScope) => JSON.stringify([
  s.accountId, s.communityId, s.postId, s.referenceCommunityId, s.referencePostId, s.authorPersonaId,
]);
export function assertDanceReferenceStatus(value: DanceReferenceStatus, scope: DanceReferenceScope, choreographyId?: string) {
  if (value.reference_post_id !== scope.referencePostId || (choreographyId !== undefined && value.choreography_id !== choreographyId))
    throw new Error("dance_reference_response_changed");
}

/** Uses the installed client's strict decoders. Authoring belongs to the song
 * community; video ownership is checked against fresh account-owned personas.
 * Original-command recovery deliberately does not require the video to remain
 * public: the server's saved receipt owns that decision. */
export function createDanceReferenceApi(provided?: Client, csrf: () => string | undefined = readCsrfCookie) {
  const authority = captureSessionAuthority();
  const current = (signal: AbortSignal) => { signal.throwIfAborted(); if (!isCurrentSessionAuthority(authority)) throw new Error("dance_reference_session_changed"); };
  const guarded = async <T>(accountId: string, signal: AbortSignal, use: (api: Client) => Promise<T>): Promise<T> => {
    current(signal); const api = provided ?? createSessionApiClient();
    const identity = async () => { current(signal); const actor = await api.get_usersMe(undefined, { signal }); current(signal); if (actor.id !== accountId) throw new Error("dance_reference_account_changed"); };
    await identity(); current(signal); const result = await use(api); current(signal); await identity(); current(signal); return result;
  };
  const write = (signal: AbortSignal) => { current(signal); const token = csrf(); current(signal); if (!token) throw new Error("dance_reference_csrf_unavailable"); return sessionRequestOptions(token, { signal }); };
  return {
    async target(accountId: string, referencePostId: string, signal: AbortSignal): Promise<DanceReferenceTarget> {
      return guarded(accountId, signal, async api => {
        const [video, personas] = await Promise.all([
          api.get_postsPostId({ path: { postId: referencePostId } }, { signal }),
          api.get_personas(undefined, { signal }),
        ]);
        current(signal);
        if ("kind" in video || video.post.id !== referencePostId || video.post.post_type !== "video"
          || video.post.status !== "published" || video.post.visibility !== "public"
          || video.video?.soundtrack.kind !== "song_reference") throw new Error("dance_reference_video_unavailable");
        const author = video.post.author_persona?.persona_id;
        if (!author || !personas.personas.some(p => p.persona_id === author && p.status === "active"
          && p.community_binding?.community_id === video.post.community)) throw new Error("dance_reference_video_not_owned");
        const songId = video.video.soundtrack.song_reference.song_post_id;
        const song = await api.get_postsPostId({ path: { postId: songId } }, { signal }); current(signal);
        if ("kind" in song || song.post.id !== songId || song.post.post_type !== "song"
          || song.post.status !== "published" || song.post.visibility !== "public") throw new Error("dance_reference_song_unavailable");
        return { scope: { accountId, communityId: song.post.community, postId: songId,
          referenceCommunityId: video.post.community, referencePostId, authorPersonaId: author },
          songTitle: song.post.song_title?.trim() || song.post.title?.trim() || "Song", playable: video.video.playback.status === "ready", delivery: projectVideoDelivery(video.video) };
      });
    },
    async create(scope: DanceReferenceScope, body: DanceReferenceCommand, signal: AbortSignal): Promise<DanceReferenceStatus> {
      scope = { ...scope }; body = { ...body };
      if (body.community_id !== scope.communityId || body.song_post_id !== scope.postId || body.reference_post_id !== scope.referencePostId)
        throw new Error("dance_reference_target_changed");
      const value = await guarded(scope.accountId, signal, api => api.post_communitiesCommunityIdPostsPostIdDanceModeratedReferences({
        path: { communityId: scope.communityId, postId: scope.postId }, body,
      }, write(signal)));
      assertDanceReferenceStatus(value, scope); return value;
    },
    async status(scope: DanceReferenceScope, choreographyId: string, signal: AbortSignal): Promise<DanceReferenceStatus> {
      scope = { ...scope };
      const value = await guarded(scope.accountId, signal, api => api.get_communitiesCommunityIdPostsPostIdDanceModeratedReferencesChoreographyId({
        path: { communityId: scope.communityId, postId: scope.postId, choreographyId },
      }, { signal }));
      assertDanceReferenceStatus(value, scope, choreographyId); return value;
    },
  };
}
export type DanceReferenceApi = ReturnType<typeof createDanceReferenceApi>;
