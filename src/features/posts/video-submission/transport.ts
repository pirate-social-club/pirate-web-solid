import type {
  PirateApiClient,
  PostCommunitiesCommunityIdMediaPostSubmissionsInput,
  PostCommunitiesCommunityIdMediaUploadReservationsInput,
  PostMediaPostSubmissionsSubmissionIdCancelInput,
  PostMediaPostSubmissionsSubmissionIdFinalizeInput,
  PostMediaPostSubmissionsSubmissionIdRetryInput,
  PostMediaUploadReservationsReservationIdPartsRenewInput,
} from "@pirate/api-client";
import { createApiClient, readCsrfCookie, sessionRequestOptions, type ApiClientFactoryOptions } from "../../../api/client";
import { VideoContractError, type OriginalVideoReservation, type VideoSnapshot } from "./contracts";

export type VideoCommand =
  | { readonly kind: "reserve"; readonly input: PostCommunitiesCommunityIdMediaUploadReservationsInput }
  | { readonly kind: "start"; readonly input: PostCommunitiesCommunityIdMediaPostSubmissionsInput }
  | { readonly kind: "finalize"; readonly input: PostMediaPostSubmissionsSubmissionIdFinalizeInput }
  | { readonly kind: "retry"; readonly input: PostMediaPostSubmissionsSubmissionIdRetryInput }
  | { readonly kind: "cancel"; readonly input: PostMediaPostSubmissionsSubmissionIdCancelInput }
  | { readonly kind: "renew"; readonly input: PostMediaUploadReservationsReservationIdPartsRenewInput };

type VideoApi = Pick<PirateApiClient,
  | "post_communitiesCommunityIdMediaUploadReservations"
  | "post_communitiesCommunityIdMediaPostSubmissions"
  | "post_mediaPostSubmissionsSubmissionIdFinalize"
  | "post_mediaPostSubmissionsSubmissionIdRetry"
  | "post_mediaPostSubmissionsSubmissionIdCancel"
  | "post_mediaUploadReservationsReservationIdPartsRenew"
  | "get_mediaPostSubmissionsSubmissionId"
>;

export type VideoCommandResult = OriginalVideoReservation | VideoSnapshot;
export interface VideoTransport {
  readonly execute: (command: VideoCommand) => Promise<VideoCommandResult>;
  readonly read: (submissionId: string) => Promise<VideoSnapshot>;
}

function videoSnapshot(value: Awaited<ReturnType<VideoApi["get_mediaPostSubmissionsSubmissionId"]>>): VideoSnapshot {
  if (value.track !== "video" || value.intent !== "original_audio") throw new VideoContractError("Unexpected media submission track");
  return value;
}

/** Generated validation, same-origin session and current CSRF remain mandatory. */
export function createVideoTransport(options: ApiClientFactoryOptions & {
  readonly api?: VideoApi;
  readonly csrfToken?: () => string | undefined;
} = {}): VideoTransport {
  const api = options.api ?? createApiClient(options);
  const requestOptions = () => {
    const token = (options.csrfToken ?? readCsrfCookie)();
    if (!token) throw new VideoContractError("A current CSRF cookie is required");
    return sessionRequestOptions(token);
  };
  return {
    async execute(command) {
      const session = requestOptions();
      switch (command.kind) {
        case "reserve": {
          if (command.input.body.track !== "video" || command.input.body.intent !== "original_audio") throw new VideoContractError("Only original audio is available");
          const result = await api.post_communitiesCommunityIdMediaUploadReservations(command.input, session);
          if (result.track !== "video" || result.intent !== "original_audio"
            || result.author_persona_id !== command.input.body.persona_id) throw new VideoContractError("Unexpected reservation authority");
          return result;
        }
        case "start":
          if (command.input.body.version !== "video-start-input-v1") throw new VideoContractError("Only video creation is available");
          return videoSnapshot(await api.post_communitiesCommunityIdMediaPostSubmissions(command.input, session));
        case "finalize":
          if (!("parts" in command.input.body)) throw new VideoContractError("Video finalization requires a complete part manifest");
          return videoSnapshot(await api.post_mediaPostSubmissionsSubmissionIdFinalize(command.input, session));
        case "retry": return videoSnapshot(await api.post_mediaPostSubmissionsSubmissionIdRetry(command.input, session));
        case "cancel": return videoSnapshot(await api.post_mediaPostSubmissionsSubmissionIdCancel(command.input, session));
        case "renew": {
          const result = await api.post_mediaUploadReservationsReservationIdPartsRenew(command.input, session);
          if (result.intent !== "original_audio" || result.author_persona_id !== command.input.body.persona_id
            || result.reservation_id !== command.input.path.reservationId) throw new VideoContractError("Unexpected renewal authority");
          return result;
        }
      }
    },
    async read(submissionId) {
      return videoSnapshot(await api.get_mediaPostSubmissionsSubmissionId({ path: { submissionId } }, { credentials: "same-origin" }));
    },
  };
}
