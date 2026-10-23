import type { GetPersonasResponse, GetPostsPostIdResponse, GetUsersMeResponse } from "@pirate/api-client";
import type { AuthenticatedSession } from "../../api/session";
import { publicFeedStagingContractFixture } from "../posts/feed/public-feed-staging-contract.fixture";
import type { DanceReferenceApi, DanceReferenceCommand, DanceReferenceStatus, DanceReferenceTarget } from "./dance-reference-api";

// Fictional source/test/Storybook projections only. No provider or real video.
export const danceReferenceTarget: DanceReferenceTarget = { scope: { accountId: "reference-author", communityId: "song-community", postId: "song-post",
  referenceCommunityId: "video-community", referencePostId: "video-post", authorPersonaId: "video-persona" }, songTitle: "A song to dance to", playable: true, delivery: { playback: "ready", thumbnail: "ready" } };
const s = danceReferenceTarget.scope;
export const danceReferenceSession: AuthenticatedSession = { status: "authenticated", userId: s.accountId, personas: [
  { personaId: s.authorPersonaId, displayName: "Video profile", avatarRef: null, primaryPublicHandle: null, communityBinding: { communityId: s.referenceCommunityId, bindingSource: "persona_creation" } },
  { personaId: "song-persona", displayName: "Song profile", avatarRef: null, primaryPublicHandle: null, communityBinding: { communityId: s.communityId, bindingSource: "activity_participation" } },
] };
export const danceReferenceUser: GetUsersMeResponse = { object: "user", id: s.accountId, verification_state: "unverified", created: 0,
  verification_capabilities: { unique_human: { state: "unverified" }, age_over_18: { state: "unverified" }, minimum_age: { state: "unverified" }, nationality: { state: "unverified" }, gender: { state: "unverified" }, wallet_score: { state: "unverified" } } };
export const danceReferencePersonas: GetPersonasResponse = { personas: danceReferenceSession.personas.map(p => ({
  object: "persona", persona_id: p.personaId, status: "active", profile: { object: "persona_profile", persona_id: p.personaId, revision: 1,
    display_name: p.displayName, avatar_ref: null, cover_ref: null, bio: null, preferred_locale: "en", primary_public_handle: null },
  wallet_set: { evm: null }, community_binding: p.communityBinding === null ? null : { community_id: p.communityBinding.communityId, binding_source: p.communityBinding.bindingSource },
  created_at: "2026-10-23T00:00:00Z", retired_at: null,
})) };
const base = publicFeedStagingContractFixture.items[0]!.post!;
export const danceReferenceVideo = { ...base, canonical_path: null,
  post: { ...base.post, id: s.referencePostId, community: s.referenceCommunityId, post_type: "video",
    author_persona: { object: "persona", persona_id: s.authorPersonaId, display_name: "Video profile", avatar_ref: null, primary_public_handle: null } },
  video: { track: "video", caption: "A public dance video", caption_dir: "ltr", caption_lang: "en",
    soundtrack: { kind: "song_reference", render_mode: "canonical_replace", song_reference: { song_post_id: s.postId, song_title: danceReferenceTarget.songTitle, song_author_persona_id: null } },
    playback: { status: "ready", provider: "stream", playback_ref: "fixture-playback" }, thumbnail: { status: "ready", artifact_ref: "fixture-poster" },
    data_registration: "registered", capabilities: { can_post_with_song: false } },
} satisfies GetPostsPostIdResponse;
export const danceReferenceSong = { ...base, canonical_path: null, post: { ...base.post, id: s.postId, community: s.communityId, title: danceReferenceTarget.songTitle } } satisfies GetPostsPostIdResponse;
export const danceReferenceCommand: DanceReferenceCommand = { version: "dance-moderated-reference-create-v1", idempotency_key: "original-reference-key",
  community_id: s.communityId, song_post_id: s.postId, reference_post_id: s.referencePostId, persona_id: "song-persona" };
export const danceReferenceStatus: DanceReferenceStatus = { version: "dance-moderated-reference-v1", choreography_id: "choreography", reference_post_id: s.referencePostId, status: "normalizing" };
export function createDanceReferenceFixtureApi(): DanceReferenceApi {
  return { target: async () => danceReferenceTarget, create: async () => ({ ...danceReferenceStatus, status: "pending" }), status: async () => danceReferenceStatus };
}
