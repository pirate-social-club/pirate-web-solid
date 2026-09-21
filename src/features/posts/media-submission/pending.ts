import type { PostCommunitiesCommunityIdMediaUploadReservationsResponse } from "@pirate/api-client";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  sha256Hex,
} from "../post-composer/text-submission-contract";
import type { ActiveSongMediaPostSubmission, MediaSubmissionSnapshot } from "./contracts";

export const MEDIA_PENDING_VERSION = "media-submission-pending-v1" as const;
export const MEDIA_RECOVERED_VERSION = "media-submission-recovered-v1" as const;
export const MEDIA_COMMAND_VERSION = "media-submission-command-v1" as const;

export type MediaCommandKind = "reserve" | "start" | "terms" | "finalize" | "lyrics" | "reference" | "retry" | "cancel";

/**
 * One request retained for the life of the song operation, with its exact body
 * and idempotency key, so an ambiguous response is retried as the same command
 * rather than a second upload or publication. It never leaves the coordinator.
 */
export interface PersistedMediaCommand {
  readonly version: typeof MEDIA_COMMAND_VERSION;
  readonly kind: MediaCommandKind;
  readonly idempotency_key: string;
  readonly same_origin_path: string;
  readonly body_utf8_base64url: string;
  readonly body_sha256: string;
}

export type UploadSealStatus = "not_uploaded" | "uploading" | "uploaded" | "sealed";

export interface PendingMediaSubmissionV1 {
  readonly version: typeof MEDIA_PENDING_VERSION;
  readonly community_id: string;
  readonly persona_id: string;
  readonly song_draft: {
    readonly title: string;
    readonly song_type: "original" | "remix";
    readonly author_declared_rating?: "general" | "adult_18";
  };
  readonly audio: {
    readonly blob: Blob;
    readonly name: string;
    readonly type: string;
    readonly size: number;
    readonly last_modified: number;
  };
  readonly reservation: PostCommunitiesCommunityIdMediaUploadReservationsResponse | null;
  readonly submission_id: string | null;
  readonly upload_status: UploadSealStatus;
  readonly snapshot: MediaSubmissionSnapshot | null;
  readonly commands: readonly PersistedMediaCommand[];
  readonly pending_command: PersistedMediaCommand | null;
}

/** Server-owned state attached for this session only, never a saved draft. */
export interface RecoveredMediaSubmissionV1 extends Omit<PendingMediaSubmissionV1,
  "version" | "audio" | "reservation" | "submission_id" | "upload_status" | "snapshot"> {
  readonly version: typeof MEDIA_RECOVERED_VERSION;
  readonly audio: null;
  readonly reservation: null;
  readonly submission_id: string;
  readonly upload_status: "unavailable" | "sealed";
  readonly snapshot: MediaSubmissionSnapshot;
  readonly terms_state: ActiveSongMediaPostSubmission["terms_state"];
}
export type MediaSubmissionRecord = PendingMediaSubmissionV1 | RecoveredMediaSubmissionV1;

export class MediaCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaCommandError";
  }
}

function assertSafePath(path: string): string {
  if (!path.startsWith("/api/") || path.startsWith("//") || path.includes("?") || path.includes("#")
    || /[\\\u0000-\u001f\u007f]/u.test(path) || /%(?:2f|5c)/iu.test(path)) {
    throw new MediaCommandError("Media command path is not a canonical Worker /api path");
  }
  return path;
}

export async function createPersistedMediaCommand(input: {
  readonly kind: MediaCommandKind;
  readonly idempotencyKey: string;
  readonly sameOriginPath: string;
  readonly body: object;
}): Promise<PersistedMediaCommand> {
  const idempotencyKey = input.idempotencyKey.trim();
  if (idempotencyKey === "") throw new MediaCommandError("Media command idempotency key is required");
  const bytes = new TextEncoder().encode(JSON.stringify(input.body));
  if (bytes.byteLength > 1_048_576) throw new MediaCommandError("Media command exceeds the endpoint body limit");
  return {
    version: MEDIA_COMMAND_VERSION,
    kind: input.kind,
    idempotency_key: idempotencyKey,
    same_origin_path: assertSafePath(input.sameOriginPath),
    body_utf8_base64url: bytesToBase64Url(bytes),
    body_sha256: await sha256Hex(bytes),
  };
}

export async function mediaCommandBody(command: PersistedMediaCommand): Promise<Uint8Array> {
  if (command.version !== MEDIA_COMMAND_VERSION || !/^[a-f0-9]{64}$/u.test(command.body_sha256)) {
    throw new MediaCommandError("Stored media command is invalid");
  }
  assertSafePath(command.same_origin_path);
  const bytes = base64UrlToBytes(command.body_utf8_base64url);
  if (await sha256Hex(bytes) !== command.body_sha256) throw new MediaCommandError("Stored media command digest does not match its bytes");
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MediaCommandError("Stored media command body is invalid");
  }
  // SAFETY: the representation was checked as an object before the retained
  // idempotency-key field is inspected.
  const parsed = value as { idempotency_key?: unknown };
  if (parsed.idempotency_key !== command.idempotency_key) {
    throw new MediaCommandError("Stored media command key does not match its body");
  }
  return bytes;
}
