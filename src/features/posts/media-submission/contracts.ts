import type {
  GetMediaPostSubmissionsSubmissionIdResponse,
  PostCommunitiesCommunityIdMediaPostSubmissionsInput,
  PostCommunitiesCommunityIdMediaUploadReservationsInput,
  PostMediaPostSubmissionsSubmissionIdLyricsInput,
  PostMediaPostSubmissionsSubmissionIdTermsInput,
} from "@pirate/api-client";

export type MediaSubmissionSnapshot = Extract<
  GetMediaPostSubmissionsSubmissionIdResponse,
  { readonly track: "song" }
>;
export type SongLicensePreset = "non-commercial" | "commercial-use" | "commercial-remix";

export interface SongRoyaltyAllocation {
  readonly recipientId: string;
  readonly shareBps: number;
}

export class SongSubmissionContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SongSubmissionContractError";
  }
}

function requiredId(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized === "" || normalized.length > 512 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new SongSubmissionContractError(`${field} must be a non-empty recipient identifier`);
  }
  return normalized;
}

export function percentTextToBasisPoints(value: string): number {
  const normalized = value.trim();
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/u.exec(normalized);
  if (!match) throw new SongSubmissionContractError("Revenue share must be a percentage with at most two decimal places");
  const whole = Number.parseInt(match[1]!, 10);
  const fraction = Number.parseInt((match[2] ?? "").padEnd(2, "0") || "0", 10);
  const basisPoints = whole * 100 + fraction;
  if (basisPoints > 10_000) throw new SongSubmissionContractError("Revenue share cannot exceed 100%");
  return basisPoints;
}

export function basisPointsToPercentText(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new SongSubmissionContractError("Revenue share basis points are out of range");
  }
  const whole = Math.floor(value / 100);
  const fraction = String(value % 100).padStart(2, "0").replace(/0+$/u, "");
  return fraction === "" ? String(whole) : `${whole}.${fraction}`;
}

export function normalizeRoyaltyAllocations(
  allocations: readonly SongRoyaltyAllocation[],
  authorPersonaId: string,
): readonly { readonly recipient_id: string; readonly share_bps: number }[] {
  const author = requiredId(authorPersonaId, "authorPersonaId");
  if (allocations.length === 0) throw new SongSubmissionContractError("At least one royalty recipient is required");
  const recipients = new Set<string>();
  let total = 0;
  const normalized = allocations.map((allocation) => {
    const recipientId = requiredId(allocation.recipientId, "recipientId");
    if (recipients.has(recipientId)) throw new SongSubmissionContractError("Royalty recipients must be unique");
    if (!Number.isInteger(allocation.shareBps) || allocation.shareBps <= 0 || allocation.shareBps > 10_000) {
      throw new SongSubmissionContractError("Royalty shares must be positive integer basis points");
    }
    recipients.add(recipientId);
    total += allocation.shareBps;
    return { recipient_id: recipientId, share_bps: allocation.shareBps };
  });
  if (!recipients.has(author)) throw new SongSubmissionContractError("Royalty allocations must include the authenticated author");
  if (total !== 10_000) throw new SongSubmissionContractError("Royalty shares must total 10000 basis points");
  return normalized;
}

export function buildReserveSongAudioInput(input: {
  readonly communityId: string;
  readonly personaId: string;
  readonly idempotencyKey: string;
  readonly file: Pick<File, "size" | "type">;
  readonly expectedSha256?: string;
}): PostCommunitiesCommunityIdMediaUploadReservationsInput {
  if (!Number.isSafeInteger(input.file.size) || input.file.size <= 0) {
    throw new SongSubmissionContractError("Audio must have a positive safe byte size");
  }
  const mediaType = input.file.type.trim().toLowerCase();
  if (!/^audio\/[a-z0-9!#$&^_.+-]+$/u.test(mediaType)) {
    throw new SongSubmissionContractError("Audio must have a lowercase audio media type without parameters");
  }
  if (input.expectedSha256 !== undefined && !/^[a-f0-9]{64}$/u.test(input.expectedSha256)) {
    throw new SongSubmissionContractError("Expected SHA-256 must be lowercase hexadecimal");
  }
  return {
    path: { communityId: requiredId(input.communityId, "communityId") },
    body: {
      persona_id: requiredId(input.personaId, "personaId"),
      idempotency_key: requiredId(input.idempotencyKey, "idempotencyKey"),
      track: "song",
      slot: "primary_audio",
      expected_content_type: mediaType,
      expected_size_bytes: input.file.size,
      ...(input.expectedSha256 === undefined ? {} : { expected_sha256: input.expectedSha256 }),
    },
  };
}

export function buildStartSongInput(input: {
  readonly communityId: string;
  readonly personaId: string;
  readonly idempotencyKey: string;
  readonly reservationId: string;
  readonly songType: "original" | "remix";
  readonly title: string;
  readonly authorDeclaredRating?: "general" | "adult_18";
}): PostCommunitiesCommunityIdMediaPostSubmissionsInput {
  const title = input.title.trim();
  if (title === "" || title.length > 300) throw new SongSubmissionContractError("Song title is required and cannot exceed 300 characters");
  const body = {
    persona_id: requiredId(input.personaId, "personaId"),
    version: "song-start-input-v1" as const,
    title,
    audio_reservation_id: requiredId(input.reservationId, "reservationId"),
    song_type: input.songType,
    idempotency_key: requiredId(input.idempotencyKey, "idempotencyKey"),
  };
  return {
    path: { communityId: requiredId(input.communityId, "communityId") },
    body: input.authorDeclaredRating === undefined
      ? body
      : { ...body, author_declared_rating: input.authorDeclaredRating },
  };
}

export function buildSongTermsInput(input: {
  readonly submissionId: string;
  readonly personaId: string;
  readonly idempotencyKey: string;
  readonly expectedCreationRevision: number;
  readonly licensePreset: SongLicensePreset;
  readonly commercialRevShareBps?: number;
  readonly allocations: readonly SongRoyaltyAllocation[];
}): PostMediaPostSubmissionsSubmissionIdTermsInput {
  const common = {
    royalty_allocations: normalizeRoyaltyAllocations(input.allocations, input.personaId),
    access_mode: "public" as const,
    persona_id: requiredId(input.personaId, "personaId"),
    idempotency_key: requiredId(input.idempotencyKey, "idempotencyKey"),
    expected_creation_revision: input.expectedCreationRevision,
  };
  if (!Number.isInteger(input.expectedCreationRevision) || input.expectedCreationRevision < 1) {
    throw new SongSubmissionContractError("Expected creation revision must be a positive integer");
  }
  if (input.licensePreset !== "commercial-remix") {
    if (input.commercialRevShareBps !== undefined) {
      throw new SongSubmissionContractError("Commercial remix share must be omitted for this license");
    }
    return { path: { submissionId: requiredId(input.submissionId, "submissionId") }, body: { ...common, license_preset: input.licensePreset } };
  }
  const share = input.commercialRevShareBps ?? 1_000;
  if (!Number.isInteger(share) || share < 0 || share > 10_000) {
    throw new SongSubmissionContractError("Commercial remix share must be integer basis points from 0 through 10000");
  }
  return {
    path: { submissionId: requiredId(input.submissionId, "submissionId") },
    body: { ...common, license_preset: "commercial-remix", commercial_rev_share_bps: share },
  };
}

export function buildSongLyricsInput(input: {
  readonly submissionId: string;
  readonly personaId: string;
  readonly idempotencyKey: string;
  readonly expectedCreationRevision: number;
  readonly expectedAudioRevision: number;
  readonly lyrics: string;
}): PostMediaPostSubmissionsSubmissionIdLyricsInput {
  if (input.lyrics.length === 0 || input.lyrics.length > 200_000 || new TextEncoder().encode(input.lyrics).byteLength > 800_000) {
    throw new SongSubmissionContractError("Lyrics must be non-empty and within the published text bounds");
  }
  if (!Number.isInteger(input.expectedCreationRevision) || input.expectedCreationRevision < 1
    || !Number.isInteger(input.expectedAudioRevision) || input.expectedAudioRevision < 1) {
    throw new SongSubmissionContractError("Lyrics revision fences must be positive integers");
  }
  return {
    path: { submissionId: requiredId(input.submissionId, "submissionId") },
    body: {
      persona_id: requiredId(input.personaId, "personaId"),
      version: "bind-song-lyrics-v1",
      idempotency_key: requiredId(input.idempotencyKey, "idempotencyKey"),
      expected_creation_revision: input.expectedCreationRevision,
      expected_audio_revision: input.expectedAudioRevision,
      lyrics: input.lyrics,
    },
  };
}
