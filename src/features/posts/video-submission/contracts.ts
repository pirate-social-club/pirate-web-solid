import type {
  GetMediaPostSubmissionsSubmissionIdResponse,
  PostCommunitiesCommunityIdMediaPostSubmissionsInput,
  PostCommunitiesCommunityIdMediaUploadReservationsInput,
  PostCommunitiesCommunityIdMediaUploadReservationsResponse,
  PostMediaPostSubmissionsSubmissionIdFinalizeInput,
} from "@pirate/api-client";

export type VideoSnapshot = Extract<GetMediaPostSubmissionsSubmissionIdResponse, { track: "video" }>;
export type VideoReservation = Extract<PostCommunitiesCommunityIdMediaUploadReservationsResponse, { track: "video" }>;
export type OriginalVideoReservation = Extract<VideoReservation, { intent: "original_audio" }>;
export type SongVideoReservation = Extract<VideoReservation, { intent: "song_reference" }>;
type VideoReservationBody = Extract<PostCommunitiesCommunityIdMediaUploadReservationsInput["body"], { track: "video" }>;
export type SongVideoReservationBody = Extract<VideoReservationBody, { intent: "song_reference" }>;

/** What a song-backed video names: the song post, the audio revision the
 * server reported for it, and the interval in integer 48 kHz samples. These are
 * the values the server freezes into the render plan, so they are carried
 * exactly as sent and never recomputed from a display value. */
export interface SongVideoSelection {
  readonly songPostId: string;
  readonly audioRevision: number;
  readonly clipStartSamples: number;
  readonly clipDurationSamples: number;
  readonly selectedFrom: SongVideoReservationBody["selected_from"];
}
export interface VideoPartReceipt {
  readonly part_number: number;
  readonly etag: string;
}

export class VideoContractError extends Error {
  constructor(message: string) { super(message); this.name = "VideoContractError"; }
}

function identifier(value: string): string {
  if (value.trim() === "" || value !== value.trim()
    || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new VideoContractError("A stable non-empty identifier is required");
  }
  return value;
}

interface VideoFileFields {
  readonly type: "video/mp4" | "video/quicktime";
  readonly size: number;
}

function videoFile(file: Pick<File, "size" | "type">): VideoFileFields {
  if (file.type !== "video/mp4" && file.type !== "video/quicktime") {
    throw new VideoContractError("Choose an MP4 or MOV video; WebM is not supported");
  }
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > 500 * 1024 * 1024) {
    throw new VideoContractError("Video must be non-empty and no larger than 500 MiB");
  }
  return { type: file.type, size: file.size };
}

/** An original-audio video: no terms and no song fields. */
export function reserveOriginalVideo(input: {
  readonly communityId: string;
  readonly personaId: string;
  readonly key: string;
  readonly file: Pick<File, "size" | "type">;
}): PostCommunitiesCommunityIdMediaUploadReservationsInput {
  const file = videoFile(input.file);
  return {
    path: { communityId: identifier(input.communityId) },
    body: {
      persona_id: identifier(input.personaId), idempotency_key: identifier(input.key),
      track: "video", slot: "primary_video", intent: "original_audio",
      expected_content_type: file.type, expected_size_bytes: file.size,
    },
  };
}

/** A video posted to a song. The interval must already be whole samples; the
 * server revalidates all of it against the canonical song before it issues any
 * upload authority, so nothing here is a claim that it will be accepted. */
export function reserveSongVideo(input: {
  readonly communityId: string;
  readonly personaId: string;
  readonly key: string;
  readonly file: Pick<File, "size" | "type">;
  readonly song: SongVideoSelection;
}): PostCommunitiesCommunityIdMediaUploadReservationsInput & { readonly body: SongVideoReservationBody } {
  const file = videoFile(input.file);
  const { song } = input;
  if (!Number.isSafeInteger(song.audioRevision) || song.audioRevision < 1) {
    throw new VideoContractError("The song's audio revision must come from the server");
  }
  if (!Number.isSafeInteger(song.clipStartSamples) || song.clipStartSamples < 0
    || !Number.isSafeInteger(song.clipDurationSamples) || song.clipDurationSamples < 1) {
    throw new VideoContractError("The song interval must be whole samples");
  }
  return {
    path: { communityId: identifier(input.communityId) },
    body: {
      persona_id: identifier(input.personaId), idempotency_key: identifier(input.key),
      track: "video", slot: "primary_video", intent: "song_reference",
      expected_content_type: file.type, expected_size_bytes: file.size,
      song_post_id: identifier(song.songPostId), selected_from: song.selectedFrom,
      audio_revision: song.audioRevision,
      clip_start_samples: song.clipStartSamples, clip_duration_samples: song.clipDurationSamples,
    },
  };
}

/** The server echoed a different song or interval than the one sent. That is
 * never accepted quietly: the upload would be rendered against a plan the
 * author did not choose. */
export class SongReservationMismatch extends VideoContractError {
  constructor(message: string) { super(message); this.name = "SongReservationMismatch"; }
}

/** A song-backed reservation must freeze exactly what was sent. */
export function verifySongReservation(sent: SongVideoReservationBody, result: VideoReservation): SongVideoReservation {
  if (result.intent !== "song_reference") {
    throw new SongReservationMismatch("The server did not reserve this video as posted to the song");
  }
  if (result.song_reference.song_post_id !== sent.song_post_id
    || result.song_reference.audio_revision !== sent.audio_revision) {
    throw new SongReservationMismatch("The server reserved a different song or song revision than the one chosen");
  }
  const interval = result.interval;
  if (interval.clip_start_samples !== sent.clip_start_samples
    || interval.clip_duration_samples !== sent.clip_duration_samples
    || interval.clip_start_samples + interval.clip_duration_samples > interval.song_duration_samples) {
    throw new SongReservationMismatch("The server froze a different excerpt than the one chosen");
  }
  return result;
}

/** A renewal must keep the reservation's intent, song and frozen interval. */
export function sameReservationPlan(retained: VideoReservation, renewed: VideoReservation): boolean {
  if (retained.intent === "original_audio" || renewed.intent === "original_audio") {
    return retained.intent === renewed.intent;
  }
  return retained.song_reference.song_post_id === renewed.song_reference.song_post_id
    && retained.song_reference.audio_revision === renewed.song_reference.audio_revision
    && retained.song_reference.song_asset_id === renewed.song_reference.song_asset_id
    && retained.interval.clip_start_samples === renewed.interval.clip_start_samples
    && retained.interval.clip_duration_samples === renewed.interval.clip_duration_samples
    && retained.interval.song_duration_samples === renewed.interval.song_duration_samples;
}

/** Start is the same for both intents: the reservation carries the song. */
export function startVideo(input: {
  readonly communityId: string;
  readonly personaId: string;
  readonly key: string;
  readonly reservation: VideoReservation;
  readonly caption: string;
  readonly rating: "general" | "adult_18";
}): PostCommunitiesCommunityIdMediaPostSubmissionsInput {
  if (input.reservation.author_persona_id !== input.personaId) {
    throw new VideoContractError("The reservation belongs to a different persona");
  }
  if (input.caption.length > 2_200) throw new VideoContractError("Caption exceeds 2200 characters");
  return {
    path: { communityId: identifier(input.communityId) },
    body: {
      persona_id: identifier(input.personaId), idempotency_key: identifier(input.key),
      version: "video-start-input-v1", video_reservation_id: input.reservation.reservation_id,
      caption: input.caption, author_declared_rating: input.rating,
    },
  };
}

export function videoPartEtag(value: string | null): string {
  const etag = value?.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  if (!etag || new TextEncoder().encode(etag).byteLength > 256 || /[\r\n]/u.test(etag)) {
    throw new VideoContractError("Upload did not expose a valid ETag; retain this attempt for retry");
  }
  return etag;
}

export function finalizeVideo(input: {
  readonly personaId: string;
  readonly key: string;
  readonly snapshot: VideoSnapshot;
  readonly reservation: VideoReservation;
  readonly parts: readonly VideoPartReceipt[];
}): PostMediaPostSubmissionsSubmissionIdFinalizeInput {
  if (input.personaId !== input.reservation.author_persona_id
    || input.personaId !== input.snapshot.author_persona.persona_id) {
    throw new VideoContractError("Video authorship cannot change during submission");
  }
  const parts = [...input.parts].sort((a, b) => a.part_number - b.part_number);
  if (parts.length !== input.reservation.upload.part_count
    || parts.some((part, index) => part.part_number !== index + 1)) {
    throw new VideoContractError("Every upload part must have exactly one receipt before finalization");
  }
  return {
    path: { submissionId: input.snapshot.submission_id },
    body: {
      persona_id: identifier(input.personaId), idempotency_key: identifier(input.key),
      expected_creation_revision: input.snapshot.creation_revision,
      reservation_id: input.reservation.reservation_id,
      parts: parts.map(part => ({ ...part, etag: videoPartEtag(part.etag) })),
    },
  };
}
