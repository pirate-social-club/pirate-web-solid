import type { PirateApiClient } from "@pirate/api-client";
import { createPublicApiClient } from "../../api/client.ts";
import {
  createGuestBrowserClient,
  guestRequestOptions,
  readGuestCsrfCookie,
  type GuestBrowserClientOptions,
  type GuestBrowserGeneratedClient,
} from "../../api/guest-browser-client.ts";

type Method<Name extends keyof PirateApiClient> = (
  input: Parameters<PirateApiClient[Name]>[0], signal?: AbortSignal,
) => ReturnType<PirateApiClient[Name]>;

export type GuestAuthority = Awaited<ReturnType<PirateApiClient["get_guestAuthority"]>>;
export type GuestStudyPreparedContent = Awaited<ReturnType<PirateApiClient["get_communitiesCommunityIdPostsPostIdStudyPublic"]>>;
export type GuestStudySession = Awaited<ReturnType<PirateApiClient["post_communitiesCommunityIdPostsPostIdStudyGuestV1Sessions"]>>;
export type GuestStudyAnswerResult = Awaited<ReturnType<PirateApiClient["post_communitiesCommunityIdStudyGuestV1SessionsSessionIdItemsSessionItemIdAnswers"]>>;
export type GuestStudyStartOperation = Awaited<ReturnType<PirateApiClient["get_communitiesCommunityIdPostsPostIdStudyGuestV1SessionOperationsIdempotencyKey"]>>;

/** Exact generated inputs/results; no guest wire or grading model is recreated here. */
export interface GuestStudyApi {
  getPreparedContent: Method<"get_communitiesCommunityIdPostsPostIdStudyPublic">;
  discoverAuthority: Method<"get_guestAuthority">;
  issueBootstrap: Method<"post_guestBootstrap">;
  confirmBootstrap: Method<"post_guestBootstrapConfirm">;
  renewAuthority: Method<"post_guestAuthorityRenew">;
  rotateCredential: Method<"post_guestCredentialsRotate">;
  acknowledgeCredential: Method<"post_guestCredentialsAcknowledge">;
  cleanupProof: Method<"post_guestCredentialsCleanup">;
  startSession: Method<"post_communitiesCommunityIdPostsPostIdStudyGuestV1Sessions">;
  findStartOperation: Method<"get_communitiesCommunityIdPostsPostIdStudyGuestV1SessionOperationsIdempotencyKey">;
  getSession: Method<"get_communitiesCommunityIdStudyGuestV1SessionsSessionId">;
  submitAnswer: Method<"post_communitiesCommunityIdStudyGuestV1SessionsSessionIdItemsSessionItemIdAnswers">;
  listParticipations: Method<"get_guestParticipations">;
  setLearningRetention: Method<"put_guestLearningRetention">;
  deleteLearnerAudio: Method<"delete_guestLearnerAudio">;
  /** Issuance alone is not attachment; prepare/confirm remain accounting-dependent. */
  createAttachmentIntent: Method<"post_guestAttachmentIntents">;
}

export interface GuestStudyApiOptions extends GuestBrowserClientOptions {
  /** Test seams still consume the exact generated client method types. */
  readonly client?: GuestBrowserGeneratedClient;
  readonly publicClient?: Pick<PirateApiClient, "get_communitiesCommunityIdPostsPostIdStudyPublic">;
  readonly readCsrfToken?: () => string | undefined;
}

export class GuestStudyLocalError extends Error {
  constructor(readonly code: "csrf_required" | "request_too_large" | "audio_invalid") {
    super(code === "csrf_required" ? "Refresh guest authority before continuing."
      : code === "request_too_large" ? "This guest request exceeds its size limit."
      : "This recording does not meet the Study audio limits.");
    this.name = "GuestStudyLocalError";
  }
}

function boundedJson(body: unknown): void {
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 4_096)
    throw new GuestStudyLocalError("request_too_large");
}

export function createGuestStudyApi(options: GuestStudyApiOptions = {}): GuestStudyApi {
  let generated = options.client;
  let publicGenerated = options.publicClient;
  const client = () => generated ??= createGuestBrowserClient(options);
  const publicClient = () => publicGenerated ??= createPublicApiClient(options);
  const readOptions = (signal?: AbortSignal) => ({ credentials: "same-origin" as const,
    ...(signal === undefined ? {} : { signal }) });
  const writeOptions = (signal?: AbortSignal) => {
    const csrf = (options.readCsrfToken ?? readGuestCsrfCookie)();
    if (csrf === undefined) throw new GuestStudyLocalError("csrf_required");
    try { return guestRequestOptions(csrf, signal); }
    catch { throw new GuestStudyLocalError("csrf_required"); }
  };
  return {
    getPreparedContent: (input, signal) => publicClient().get_communitiesCommunityIdPostsPostIdStudyPublic(input,
      { credentials: "omit", ...(signal === undefined ? {} : { signal }) }),
    discoverAuthority: (input, signal) => client().get_guestAuthority(input, readOptions(signal)),
    async issueBootstrap(input, signal) {
      boundedJson(input.body);
      return client().post_guestBootstrap(input, writeOptions(signal));
    },
    async confirmBootstrap(input, signal) {
      boundedJson(input.body);
      return client().post_guestBootstrapConfirm(input, writeOptions(signal));
    },
    async renewAuthority(input, signal) {
      boundedJson(input.body);
      return client().post_guestAuthorityRenew(input, writeOptions(signal));
    },
    async rotateCredential(input, signal) {
      boundedJson(input.body);
      return client().post_guestCredentialsRotate(input, writeOptions(signal));
    },
    async acknowledgeCredential(input, signal) {
      boundedJson(input.body);
      return client().post_guestCredentialsAcknowledge(input, writeOptions(signal));
    },
    async cleanupProof(input, signal) {
      boundedJson(input.body);
      return client().post_guestCredentialsCleanup(input, writeOptions(signal));
    },
    async startSession(input, signal) {
      boundedJson(input.body);
      return client().post_communitiesCommunityIdPostsPostIdStudyGuestV1Sessions(input, writeOptions(signal));
    },
    findStartOperation: (input, signal) => client().get_communitiesCommunityIdPostsPostIdStudyGuestV1SessionOperationsIdempotencyKey(input, readOptions(signal)),
    getSession: (input, signal) => client().get_communitiesCommunityIdStudyGuestV1SessionsSessionId(input, readOptions(signal)),
    async submitAnswer(input, signal) {
      if (input.headers["content-type"] === "application/json") {
        boundedJson(input.body);
      } else {
        const body = input.body;
        const bytes = body instanceof Blob ? body.size
          : body instanceof ArrayBuffer || ArrayBuffer.isView(body) ? body.byteLength : 0;
        const duration = Number(input.headers["x-audio-duration-ms"]);
        if (bytes < 1 || bytes > 524_288 || !Number.isInteger(duration) || duration < 1 || duration > 60_000)
          throw new GuestStudyLocalError("audio_invalid");
      }
      return client().post_communitiesCommunityIdStudyGuestV1SessionsSessionIdItemsSessionItemIdAnswers(input, writeOptions(signal));
    },
    listParticipations: (input, signal) => client().get_guestParticipations(input, readOptions(signal)),
    async setLearningRetention(input, signal) {
      boundedJson(input.body);
      return client().put_guestLearningRetention(input, writeOptions(signal));
    },
    async deleteLearnerAudio(input, signal) {
      return client().delete_guestLearnerAudio(input, writeOptions(signal));
    },
    async createAttachmentIntent(input, signal) {
      boundedJson(input.body);
      return client().post_guestAttachmentIntents(input, writeOptions(signal));
    },
  };
}
