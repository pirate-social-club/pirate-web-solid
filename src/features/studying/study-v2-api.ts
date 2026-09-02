import {
  createPirateApiClient,
  type DeleteUsersMeLearnerAudioResponse,
  type GetCommunitiesCommunityIdPostsPostIdStudyV2Response,
  type GetCommunitiesCommunityIdStudyV2SessionsSessionIdResponse,
  type PirateApiClient,
  type PostCommunitiesCommunityIdPostsPostIdStudyV2GenerationsResponse,
  type PostCommunitiesCommunityIdPostsPostIdStudyV2SessionsResponse,
  type PostCommunitiesCommunityIdStudyV2SessionsSessionIdItemsSessionItemIdAnswersResponse,
} from "@pirate/api-client";
import {
  createGeneratedApiClient,
  readCsrfCookie,
  sessionRequestOptions,
} from "../../api/client";
import type { ApiFetch } from "../../api/proxy";

export type StudyAvailability = GetCommunitiesCommunityIdPostsPostIdStudyV2Response;
export type StudySession = PostCommunitiesCommunityIdPostsPostIdStudyV2SessionsResponse;
export type StudyAnswerResult =
  PostCommunitiesCommunityIdStudyV2SessionsSessionIdItemsSessionItemIdAnswersResponse;
export type StudyLearnerBand = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type StudyAudioContentType = "audio/webm" | "audio/ogg" | "audio/mp4" | "audio/wav";
export type StudyAudioBody = ArrayBuffer | ArrayBufferView | Blob;

type StudyGeneratedClient = Pick<
  PirateApiClient,
  | "delete_usersMeLearnerAudio"
  | "get_communitiesCommunityIdPostsPostIdStudyV2"
  | "get_communitiesCommunityIdStudyV2SessionsSessionId"
  | "get_postsPostId"
  | "post_communitiesCommunityIdPostsPostIdStudyV2Generations"
  | "post_communitiesCommunityIdPostsPostIdStudyV2Sessions"
  | "post_communitiesCommunityIdStudyV2SessionsSessionIdItemsSessionItemIdAnswers"
>;

export interface StudyV2ApiOptions {
  /** Test seam. Production uses the generated client through the same-origin Worker proxy. */
  client?: StudyGeneratedClient;
  fetchImpl?: ApiFetch;
  origin?: string | URL;
  readCsrfToken?: () => string | undefined;
}

export interface StudyV2Api {
  loadAvailability(postId: string, signal?: AbortSignal): Promise<{
    availability: StudyAvailability;
    communityId: string;
  }>;
  requestGeneration(input: {
    communityId: string;
    postId: string;
    targetLanguage: string;
    learnerBand: StudyLearnerBand;
    signal?: AbortSignal;
  }): Promise<PostCommunitiesCommunityIdPostsPostIdStudyV2GenerationsResponse>;
  createSession(input: {
    communityId: string;
    postId: string;
    personaId: string;
    idempotencyKey: string;
    targetLanguage: string | null;
    learnerBand: StudyLearnerBand | null;
    timezone: string;
    signal?: AbortSignal;
  }): Promise<StudySession>;
  getSession(input: {
    communityId: string;
    sessionId: string;
    signal?: AbortSignal;
  }): Promise<GetCommunitiesCommunityIdStudyV2SessionsSessionIdResponse>;
  submitChoice(input: {
    attemptNumber: number;
    choiceKey: string;
    communityId: string;
    idempotencyKey: string;
    sessionId: string;
    sessionItemId: string;
    signal?: AbortSignal;
  }): Promise<StudyAnswerResult>;
  submitAudio(input: {
    attemptNumber: number;
    audio: StudyAudioBody;
    audioDurationMs?: number;
    communityId: string;
    contentType: StudyAudioContentType;
    idempotencyKey: string;
    sessionId: string;
    sessionItemId: string;
    signal?: AbortSignal;
  }): Promise<StudyAnswerResult>;
  deleteLearnerAudio(signal?: AbortSignal): Promise<DeleteUsersMeLearnerAudioResponse>;
}

export class StudyV2LocalError extends Error {
  readonly code: "age_locked" | "csrf_required";

  constructor(code: StudyV2LocalError["code"], message: string) {
    super(message);
    this.name = "StudyV2LocalError";
    this.code = code;
  }
}

export function createStudyV2Api(options: StudyV2ApiOptions = {}): StudyV2Api {
  let generatedClient = options.client;
  const client = (): StudyGeneratedClient => {
    generatedClient ??= createGeneratedApiClient(
      createPirateApiClient,
      { fetchImpl: options.fetchImpl, origin: options.origin },
      { credentials: "same-origin" },
    );
    return generatedClient;
  };
  const csrfToken = options.readCsrfToken ?? readCsrfCookie;
  const writeOptions = (signal?: AbortSignal) => {
    const token = csrfToken();
    if (token === undefined) {
      throw new StudyV2LocalError(
        "csrf_required",
        "Refresh the page before changing this study session.",
      );
    }
    return sessionRequestOptions(token, { signal });
  };

  return {
    async createSession({
      communityId,
      idempotencyKey,
      learnerBand,
      personaId,
      postId,
      signal,
      targetLanguage,
      timezone,
    }) {
      return client().post_communitiesCommunityIdPostsPostIdStudyV2Sessions({
        body: {
          idempotency_key: idempotencyKey,
          learner_band: learnerBand,
          persona_id: personaId,
          target_language: targetLanguage,
          timezone,
        },
        path: { communityId, postId },
      }, writeOptions(signal));
    },
    async deleteLearnerAudio(signal) {
      return client().delete_usersMeLearnerAudio(undefined, writeOptions(signal));
    },
    getSession({ communityId, sessionId, signal }) {
      return client().get_communitiesCommunityIdStudyV2SessionsSessionId(
        { path: { communityId, sessionId } },
        { signal },
      );
    },
    async loadAvailability(postId, signal) {
      const post = await client().get_postsPostId({ path: { postId } }, { signal });
      if ("kind" in post) {
        throw new StudyV2LocalError("age_locked", "Age verification is required for this song.");
      }
      const communityId = post.post.community;
      const availability = await client().get_communitiesCommunityIdPostsPostIdStudyV2(
        { path: { communityId, postId } },
        { signal },
      );
      return { availability, communityId };
    },
    async requestGeneration({ communityId, learnerBand, postId, signal, targetLanguage }) {
      return client().post_communitiesCommunityIdPostsPostIdStudyV2Generations({
        body: {
          learner_band: learnerBand,
          target_language: targetLanguage,
        },
        path: { communityId, postId },
      }, writeOptions(signal));
    },
    async submitAudio({
      attemptNumber,
      audio,
      audioDurationMs,
      communityId,
      contentType,
      idempotencyKey,
      sessionId,
      sessionItemId,
      signal,
    }) {
      return client().post_communitiesCommunityIdStudyV2SessionsSessionIdItemsSessionItemIdAnswers({
        body: audio,
        headers: {
          "content-type": contentType,
          "idempotency-key": idempotencyKey,
          "x-audio-duration-ms": audioDurationMs === undefined ? undefined : String(audioDurationMs),
          "x-study-attempt-number": String(attemptNumber),
        },
        path: { communityId, sessionId, sessionItemId },
      }, writeOptions(signal));
    },
    async submitChoice({
      attemptNumber,
      choiceKey,
      communityId,
      idempotencyKey,
      sessionId,
      sessionItemId,
      signal,
    }) {
      return client().post_communitiesCommunityIdStudyV2SessionsSessionIdItemsSessionItemIdAnswers({
        body: { choice_key: choiceKey, kind: "single_select" },
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          "x-study-attempt-number": String(attemptNumber),
        },
        path: { communityId, sessionId, sessionItemId },
      }, writeOptions(signal));
    },
  };
}
