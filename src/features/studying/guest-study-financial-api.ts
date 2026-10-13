// POST-ARTIFACT SOURCE PROPOSAL: requires genuine @pirate/api-client0.119.0.
// Names come from actual registry paths/codegen, not a hand-written SDK/interface.
import { createPirateApiClient, type PirateApiClient } from "@pirate/api-client";
import { createGeneratedApiClient, readCsrfCookie, sessionRequestOptions, type ApiClientFactoryOptions } from "../../api/client";
import { GuestStudyLocalError } from "./guest-study-api";
import { isGuestRewardTerms, rewardPreviewMatchesRoute, type GuestStudyRewardPreviewReader } from "./guest-study-reward-model";

type Method<N extends keyof PirateApiClient> = (input: Parameters<PirateApiClient[N]>[0], signal?: AbortSignal) => ReturnType<PirateApiClient[N]>;
type FinancialMethods =
  "get_communitiesCommunityIdPostsPostIdStudyPublicV2" |
  "get_communitiesCommunityIdPostsPostIdStudyOwnerV1Preview" |
  "post_communitiesCommunityIdPostsPostIdStudyOwnerV1Sessions" |
  "get_communitiesCommunityIdStudyOwnerV1SessionsSessionId" |
  "get_communitiesCommunityIdPostsPostIdStudyOwnerV1SessionOperationsIdempotencyKey" |
  "post_communitiesCommunityIdStudyOwnerV1SessionsSessionIdItemsSessionItemIdAnswers" |
  "get_rewardsParticipationsOwnerV1" | "get_rewardsParticipationsParticipationIdOwnerV1" |
  "get_usersMeRewardsOwnerCreditsV1" | "get_usersMeRewardsOwnerCreditsV1CreditId";
interface Options extends Omit<ApiClientFactoryOptions, "origin" | "sessionRecovery"> {
  origin: string;
  readAccountCsrf?: () => string | undefined;
  client?: Pick<PirateApiClient, FinancialMethods>;
}
export interface OwnerStudyFinancialApi {
  getRewardPreview: Method<"get_communitiesCommunityIdPostsPostIdStudyOwnerV1Preview">;
  startSession: Method<"post_communitiesCommunityIdPostsPostIdStudyOwnerV1Sessions">;
  getSession: Method<"get_communitiesCommunityIdStudyOwnerV1SessionsSessionId">;
  findStartOperation: Method<"get_communitiesCommunityIdPostsPostIdStudyOwnerV1SessionOperationsIdempotencyKey">;
  submitAnswer: Method<"post_communitiesCommunityIdStudyOwnerV1SessionsSessionIdItemsSessionItemIdAnswers">;
  listParticipations: Method<"get_rewardsParticipationsOwnerV1">;
  getParticipation: Method<"get_rewardsParticipationsParticipationIdOwnerV1">;
  listCredits: Method<"get_usersMeRewardsOwnerCreditsV1">;
  getCredit: Method<"get_usersMeRewardsOwnerCreditsV1CreditId">;
}
function clientAtOrigin(options: Options) {
  const url = new URL(options.origin);
  if (url.origin !== options.origin || url.protocol !== "https:") throw new Error("Initiating origin required");
  const alive = () => {
    if (typeof location !== "undefined" && location.origin !== options.origin) throw new Error("Initiating origin changed");
  };
  const generated = options.client ?? createGeneratedApiClient(createPirateApiClient, {
    origin: options.origin, fetchImpl: options.fetchImpl, sessionRecovery: "none",
  });
  return { generated, alive };
}
/** Public preview never depends on Account/Guest proof; explicit acceptance stays UI-owned. */
export function createGuestStudyRewardPreviewReader(options: Options): GuestStudyRewardPreviewReader {
  const { generated, alive } = clientAtOrigin(options);
  return { async load(communityId, postId, signal) {
    alive();
    const response = await generated.get_communitiesCommunityIdPostsPostIdStudyPublicV2({
      path: { communityId, postId }, query: {},
    }, { credentials: "omit", ...(signal === undefined ? {} : { signal }) });
    const { reward_preview_terms_hash, ...projection } = response;
    // Exact existing internal projection; new wire-only hash cannot leak into v1.
    const prepared = { ...projection, object: "guest_study_prepared_content_v1" as const };
    if (response.reward_preview === null) {
      if (reward_preview_terms_hash !== null) throw new Error("Server preview/hash differ");
      return { prepared, acceptedPreview: null };
    }
    if (reward_preview_terms_hash === null || !/^[a-f0-9]{64}$/u.test(reward_preview_terms_hash) || !isGuestRewardTerms(response.reward_preview))
      throw new Error("Server preview/hash differ");
    const acceptedPreview = { terms: response.reward_preview, requestHash: reward_preview_terms_hash };
    if (!rewardPreviewMatchesRoute(acceptedPreview, communityId, postId, response.disclosure.version))
      throw new Error("Server preview belongs to another activity");
    // Echo exactly server-issued full12-field native preview hash; no client hash
    // and no replacement by reward_preview.terms_hash (the offer-leg hash).
    return { prepared, acceptedPreview };
  } };
}
/** Ordinary authenticated owner flow. No implicit persona, Guest proof or request replay. */
export function createOwnerStudyFinancialApi(options: Options): OwnerStudyFinancialApi {
  const { generated, alive } = clientAtOrigin(options);
  const read = (signal?: AbortSignal) => { alive(); return { credentials: "same-origin" as const, ...(signal === undefined ? {} : { signal }) }; };
  const write = (signal?: AbortSignal) => {
    alive(); const csrf = (options.readAccountCsrf ?? readCsrfCookie)();
    if (csrf === undefined) throw new Error("Ordinary account session CSRF required");
    return sessionRequestOptions(csrf, signal === undefined ? {} : { signal });
  };
  const bounded = (body: unknown) => {
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 4096) throw new GuestStudyLocalError("request_too_large");
  };
  return {
    getRewardPreview: (input, signal) => generated.get_communitiesCommunityIdPostsPostIdStudyOwnerV1Preview(input, read(signal)),
    startSession: (input, signal) => { bounded(input.body); return generated.post_communitiesCommunityIdPostsPostIdStudyOwnerV1Sessions(input, write(signal)); },
    getSession: (input, signal) => generated.get_communitiesCommunityIdStudyOwnerV1SessionsSessionId(input, read(signal)),
    findStartOperation: (input, signal) => generated.get_communitiesCommunityIdPostsPostIdStudyOwnerV1SessionOperationsIdempotencyKey(input, read(signal)),
    submitAnswer: (input, signal) => {
      if (input.headers["content-type"] === "application/json") bounded(input.body);
      else {
        const bytes = input.body instanceof Blob ? input.body.size
          : input.body instanceof ArrayBuffer || ArrayBuffer.isView(input.body) ? input.body.byteLength : 0;
        const duration = Number(input.headers["x-audio-duration-ms"]);
        if (bytes < 1 || bytes > 524288 || !Number.isInteger(duration) || duration < 1 || duration > 60000)
          throw new GuestStudyLocalError("audio_invalid");
      }
      return generated.post_communitiesCommunityIdStudyOwnerV1SessionsSessionIdItemsSessionItemIdAnswers(input, write(signal));
    },
    listParticipations: (input, signal) => generated.get_rewardsParticipationsOwnerV1(input, read(signal)),
    getParticipation: (input, signal) => generated.get_rewardsParticipationsParticipationIdOwnerV1(input, read(signal)),
    listCredits: (input, signal) => generated.get_usersMeRewardsOwnerCreditsV1(input, read(signal)),
    getCredit: (input, signal) => generated.get_usersMeRewardsOwnerCreditsV1CreditId(input, read(signal)),
  };
}
