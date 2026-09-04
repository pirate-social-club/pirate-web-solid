import {
  ApiClientError,
  type GetMediaPostSubmissionsSubmissionIdResponse,
  type PirateApiClient,
  type PostCommunitiesCommunityIdMediaPostSubmissionsInput,
  type PostCommunitiesCommunityIdMediaUploadReservationsInput,
  type PostCommunitiesCommunityIdMediaUploadReservationsResponse,
  type PostMediaPostSubmissionsSubmissionIdCancelInput,
  type PostMediaPostSubmissionsSubmissionIdFinalizeInput,
  type PostMediaPostSubmissionsSubmissionIdLyricsInput,
  type PostMediaPostSubmissionsSubmissionIdRetryInput,
  type PostMediaPostSubmissionsSubmissionIdTermsInput,
} from "@pirate/api-client";
import { createApiClient, readCsrfCookie, sessionRequestOptions } from "../../../api/client";
import type { ApiFetch } from "../../../api/proxy";
import type { MediaSubmissionSnapshot } from "./contracts";
import { mediaCommandBody, type PersistedMediaCommand } from "./pending";

type MediaApiClient = Pick<PirateApiClient,
  | "post_communitiesCommunityIdMediaUploadReservations"
  | "post_communitiesCommunityIdMediaPostSubmissions"
  | "post_mediaPostSubmissionsSubmissionIdTerms"
  | "post_mediaPostSubmissionsSubmissionIdLyrics"
  | "post_mediaPostSubmissionsSubmissionIdFinalize"
  | "get_mediaPostSubmissionsSubmissionId"
  | "post_mediaPostSubmissionsSubmissionIdRetry"
  | "post_mediaPostSubmissionsSubmissionIdCancel"
>;

export type MediaCommandResult = PostCommunitiesCommunityIdMediaUploadReservationsResponse | MediaSubmissionSnapshot;

export interface MediaSubmissionTransport {
  readonly dispatch: (command: PersistedMediaCommand) => Promise<MediaCommandResult>;
  readonly read: (submissionId: string) => Promise<MediaSubmissionSnapshot | null>;
  readonly upload: (
    reservation: PostCommunitiesCommunityIdMediaUploadReservationsResponse,
    audio: Blob,
    onProgress?: (sent: number, total: number) => void,
  ) => Promise<void>;
}

export class AmbiguousMediaSubmissionError extends Error {
  constructor(message = "The media submission result is uncertain") {
    super(message);
    this.name = "AmbiguousMediaSubmissionError";
  }
}

export class MediaSubmissionConflictError extends Error {
  readonly submissionId?: string;
  readonly conflictKind: "idempotency_conflict" | "command_conflict";

  constructor(error: ApiClientError) {
    super(error.message);
    this.name = "MediaSubmissionConflictError";
    this.conflictKind = error.declaredName === "IdempotencyConflict" ? "idempotency_conflict" : "command_conflict";
    this.submissionId = typeof error.details?.submission_id === "string" ? error.details.submission_id : undefined;
  }
}

function songSnapshot(
  value: GetMediaPostSubmissionsSubmissionIdResponse,
): MediaSubmissionSnapshot {
  if (value.track !== "song") {
    throw new AmbiguousMediaSubmissionError(
      "The song submission endpoint returned a different media track",
    );
  }
  return value;
}

function pathPart(path: string, pattern: RegExp, name: string): string {
  const match = pattern.exec(path);
  if (!match?.[1]) throw new AmbiguousMediaSubmissionError(`Stored ${name} command path is invalid`);
  return decodeURIComponent(match[1]);
}

async function body<T extends { readonly idempotency_key: string }>(command: PersistedMediaCommand): Promise<T> {
  const bytes = await mediaCommandBody(command);
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AmbiguousMediaSubmissionError("Stored media command body is invalid");
  }
  // SAFETY: the representation was established as an object before its
  // retained idempotency-key field is inspected.
  const candidate = value as { idempotency_key?: unknown };
  if (candidate.idempotency_key !== command.idempotency_key) throw new AmbiguousMediaSubmissionError("Stored media command body is invalid");
  // SAFETY: commands are created only from the corresponding generated input
  // body and are digest-checked before this replay boundary.
  return value as T;
}

function requestOptions(csrfToken: () => string | undefined) {
  const csrf = csrfToken();
  if (csrf === undefined) throw new AmbiguousMediaSubmissionError("A current CSRF cookie is required");
  return sessionRequestOptions(csrf);
}

export interface SameOriginMediaTransportOptions {
  readonly origin?: string | URL;
  readonly fetchImpl?: ApiFetch;
  readonly api?: MediaApiClient;
  readonly csrfToken?: () => string | undefined;
}

export function createSameOriginMediaSubmissionTransport(
  options: SameOriginMediaTransportOptions = {},
): MediaSubmissionTransport {
  const fetchImpl = options.fetchImpl ?? fetch;
  const api = options.api ?? createApiClient({ origin: options.origin, fetchImpl });
  const csrfToken = options.csrfToken ?? readCsrfCookie;
  return {
    async dispatch(command) {
      const session = requestOptions(csrfToken);
      try {
        switch (command.kind) {
          case "reserve": {
            const communityId = pathPart(command.same_origin_path, /^\/api\/communities\/([^/]+)\/media-upload-reservations$/u, "reserve");
            return api.post_communitiesCommunityIdMediaUploadReservations({
              path: { communityId },
              body: await body<PostCommunitiesCommunityIdMediaUploadReservationsInput["body"]>(command),
            }, session);
          }
          case "start": {
            const communityId = pathPart(command.same_origin_path, /^\/api\/communities\/([^/]+)\/media-post-submissions$/u, "start");
            return songSnapshot(await api.post_communitiesCommunityIdMediaPostSubmissions({
              path: { communityId },
              body: await body<PostCommunitiesCommunityIdMediaPostSubmissionsInput["body"]>(command),
            }, session));
          }
          case "terms": {
            const submissionId = pathPart(command.same_origin_path, /^\/api\/media-post-submissions\/([^/]+)\/terms$/u, "terms");
            return songSnapshot(await api.post_mediaPostSubmissionsSubmissionIdTerms({
              path: { submissionId },
              body: await body<PostMediaPostSubmissionsSubmissionIdTermsInput["body"]>(command),
            }, session));
          }
          case "lyrics": {
            const submissionId = pathPart(command.same_origin_path, /^\/api\/media-post-submissions\/([^/]+)\/lyrics$/u, "lyrics");
            return songSnapshot(await api.post_mediaPostSubmissionsSubmissionIdLyrics({
              path: { submissionId },
              body: await body<PostMediaPostSubmissionsSubmissionIdLyricsInput["body"]>(command),
            }, session));
          }
          case "finalize": {
            const submissionId = pathPart(command.same_origin_path, /^\/api\/media-post-submissions\/([^/]+)\/finalize$/u, "finalize");
            return songSnapshot(await api.post_mediaPostSubmissionsSubmissionIdFinalize({
              path: { submissionId },
              body: await body<PostMediaPostSubmissionsSubmissionIdFinalizeInput["body"]>(command),
            }, session));
          }
          case "retry": {
            const submissionId = pathPart(command.same_origin_path, /^\/api\/media-post-submissions\/([^/]+)\/retry$/u, "retry");
            return songSnapshot(await api.post_mediaPostSubmissionsSubmissionIdRetry({
              path: { submissionId },
              body: await body<PostMediaPostSubmissionsSubmissionIdRetryInput["body"]>(command),
            }, session));
          }
          case "cancel": {
            const submissionId = pathPart(command.same_origin_path, /^\/api\/media-post-submissions\/([^/]+)\/cancel$/u, "cancel");
            return songSnapshot(await api.post_mediaPostSubmissionsSubmissionIdCancel({
              path: { submissionId },
              body: await body<PostMediaPostSubmissionsSubmissionIdCancelInput["body"]>(command),
            }, session));
          }
        }
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 409 && !error.retryable) throw new MediaSubmissionConflictError(error);
        if (error instanceof ApiClientError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 409 && error.status !== 429) throw error;
        throw new AmbiguousMediaSubmissionError(error instanceof Error ? error.message : undefined);
      }
    },
    async read(submissionId) {
      try {
        return songSnapshot(
          await api.get_mediaPostSubmissionsSubmissionId(
            { path: { submissionId } },
            requestOptions(csrfToken),
          ),
        );
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404) return null;
        throw new AmbiguousMediaSubmissionError(error instanceof Error ? error.message : undefined);
      }
    },
    async upload(reservation, audio, onProgress) {
      if (reservation.upload.method !== "PUT") throw new AmbiguousMediaSubmissionError("Upload reservation method is invalid");
      const headers = new Headers();
      for (const header of reservation.upload.required_headers) headers.append(header.name, header.value);
      onProgress?.(0, audio.size);
      let response: Response;
      try {
        response = await fetchImpl(reservation.upload.url, { method: "PUT", body: audio, headers, credentials: "omit" });
      } catch (error) {
        throw new AmbiguousMediaSubmissionError(error instanceof Error ? error.message : "Upload result is uncertain");
      }
      if (!response.ok) throw new AmbiguousMediaSubmissionError(`Upload returned HTTP ${response.status}`);
      onProgress?.(audio.size, audio.size);
    },
  };
}
