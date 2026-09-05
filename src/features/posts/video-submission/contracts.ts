import type {
  GetMediaPostSubmissionsSubmissionIdResponse,
  PostCommunitiesCommunityIdMediaPostSubmissionsInput,
  PostCommunitiesCommunityIdMediaUploadReservationsInput,
  PostCommunitiesCommunityIdMediaUploadReservationsResponse,
  PostMediaPostSubmissionsSubmissionIdFinalizeInput,
} from "@pirate/api-client";

export type VideoSnapshot = Extract<GetMediaPostSubmissionsSubmissionIdResponse, { track: "video" }>;
export type OriginalVideoReservation = Extract<
  PostCommunitiesCommunityIdMediaUploadReservationsResponse,
  { track: "video"; intent: "original_audio" }
>;
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

/** Only phase-one original audio is constructible; no terms or song fields. */
export function reserveOriginalVideo(input: {
  readonly communityId: string;
  readonly personaId: string;
  readonly key: string;
  readonly file: Pick<File, "size" | "type">;
}): PostCommunitiesCommunityIdMediaUploadReservationsInput {
  if (input.file.type !== "video/mp4" && input.file.type !== "video/quicktime") {
    throw new VideoContractError("Choose an MP4 or MOV video; WebM is not supported");
  }
  if (!Number.isSafeInteger(input.file.size) || input.file.size < 1 || input.file.size > 500 * 1024 * 1024) {
    throw new VideoContractError("Video must be non-empty and no larger than 500 MiB");
  }
  return {
    path: { communityId: identifier(input.communityId) },
    body: {
      persona_id: identifier(input.personaId), idempotency_key: identifier(input.key),
      track: "video", slot: "primary_video", intent: "original_audio",
      expected_content_type: input.file.type, expected_size_bytes: input.file.size,
    },
  };
}

export function startOriginalVideo(input: {
  readonly communityId: string;
  readonly personaId: string;
  readonly key: string;
  readonly reservation: OriginalVideoReservation;
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

export function finalizeOriginalVideo(input: {
  readonly personaId: string;
  readonly key: string;
  readonly snapshot: VideoSnapshot;
  readonly reservation: OriginalVideoReservation;
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
