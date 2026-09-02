import {
  createPirateApiClient,
  type GetCommunitiesCommunityIdJoinEligibilityResponse,
  type PirateApiClient,
  type PirateApiRequestOptions,
} from "@pirate/api-client";

import {
  createGeneratedApiClient,
  readCsrfCookie,
  type ApiClientFactoryOptions,
} from "../../../api/client.ts";

export type CommunityEngagementApiClient = Pick<
  PirateApiClient,
  | "get_communitiesCommunityIdPreview"
  | "get_communitiesCommunityIdJoinEligibility"
  | "post_communitiesCommunityIdJoin"
  | "post_communitiesCommunityIdFollow"
  | "post_communitiesCommunityIdUnfollow"
>;

export type CommunityMembershipState = "member" | "not_member" | "banned" | "unknown";

export type CommunityJoinAction =
  | Readonly<{ kind: "join" }>
  | Readonly<{ kind: "request" }>
  | Readonly<{ kind: "verify"; providerId: string; intentId: string }>
  | Readonly<{ kind: "joined" }>
  | Readonly<{ kind: "pending" }>
  | Readonly<{ kind: "blocked"; reason: "banned" | "gate_failed" | "unsupported" }>;

export type CommunityViewerEngagement = Readonly<{
  membership: CommunityMembershipState;
  following: boolean;
  followerCount: number | null;
}>;

export type CommunityFollowResult = Readonly<{
  following: boolean;
  followerCount: number | null;
}>;

export type CommunityJoinResult = Readonly<{
  status: "joined" | "requested";
}>;

export interface CommunityEngagementApi {
  readViewerState(communityId: string): Promise<CommunityViewerEngagement>;
  resolveJoinAction(communityId: string): Promise<CommunityJoinAction>;
  join(communityId: string): Promise<CommunityJoinResult>;
  follow(communityId: string): Promise<CommunityFollowResult>;
  unfollow(communityId: string): Promise<CommunityFollowResult>;
}

export class CommunityEngagementLocalError extends Error {
  readonly code: "csrf_required" | "invalid_response";

  constructor(code: CommunityEngagementLocalError["code"]) {
    super(code);
    this.name = "CommunityEngagementLocalError";
    this.code = code;
  }
}

export interface CommunityEngagementApiOptions extends ApiClientFactoryOptions {
  readonly client?: CommunityEngagementApiClient;
  readonly readCsrfToken?: () => string | undefined;
}

function finiteCount(value: number | "Infinity" | "-Infinity" | "NaN" | null | undefined): number | null {
  if (value === null || value === undefined || value === "Infinity" || value === "-Infinity" || value === "NaN") {
    return null;
  }
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function validOpaqueId(value: string): boolean {
  return value.length > 0 && value.length <= 256 && value.trim() === value && ![...value].some(character => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
}

function invalidResponse(): never {
  throw new CommunityEngagementLocalError("invalid_response");
}

export function projectCommunityJoinAction(
  response: GetCommunitiesCommunityIdJoinEligibilityResponse,
  communityId: string,
): CommunityJoinAction {
  if (response.community !== communityId) return invalidResponse();
  const action = response.next_action;
  if (response.status === "joinable" && response.joinable_now && action.kind === "join") {
    return { kind: "join" };
  }
  if (response.status === "requestable" && action.kind === "request_membership") {
    return { kind: "request" };
  }
  if (response.status === "verification_required" && action.kind === "start_verification") {
    if (!validOpaqueId(action.provider_id) || !validOpaqueId(action.intent_id)) return invalidResponse();
    return { kind: "verify", providerId: action.provider_id, intentId: action.intent_id };
  }
  if (response.status === "already_joined" && action.kind === "none" && action.reason === "already_joined") {
    return { kind: "joined" };
  }
  if (
    (response.status === "pending_request" || response.status === "verification_required") &&
    action.kind === "wait"
  ) {
    return { kind: "pending" };
  }
  if (
    (response.status === "banned" || response.status === "gate_failed") &&
    action.kind === "blocked"
  ) {
    return { kind: "blocked", reason: action.reason };
  }
  return invalidResponse();
}

function mutationOptions(readCsrfToken: () => string | undefined): PirateApiRequestOptions {
  const csrfToken = readCsrfToken();
  if (csrfToken === undefined || csrfToken === "" || csrfToken.length > 16 * 1024 || /[\r\n]/u.test(csrfToken)) {
    throw new CommunityEngagementLocalError("csrf_required");
  }
  return {
    credentials: "same-origin",
    headers: { "x-csrf-token": csrfToken },
  };
}

export function createCommunityEngagementApi(
  options: CommunityEngagementApiOptions = {},
): CommunityEngagementApi {
  const client = options.client ?? createGeneratedApiClient(
    createPirateApiClient,
    { origin: options.origin, fetchImpl: options.fetchImpl },
    { credentials: "same-origin" },
  );
  const readCsrfToken = options.readCsrfToken ?? readCsrfCookie;

  return {
    async readViewerState(communityId) {
      const response = await client.get_communitiesCommunityIdPreview({ path: { communityId } });
      if (response.id !== communityId) return invalidResponse();
      return {
        membership: response.viewer_membership_status ?? "unknown",
        following: response.viewer_following === true,
        followerCount: finiteCount(response.follower_count),
      };
    },
    async resolveJoinAction(communityId) {
      const response = await client.get_communitiesCommunityIdJoinEligibility({ path: { communityId } });
      return projectCommunityJoinAction(response, communityId);
    },
    async join(communityId) {
      const response = await client.post_communitiesCommunityIdJoin(
        { path: { communityId } },
        mutationOptions(readCsrfToken),
      );
      if (response.community !== communityId || (response.status !== "joined" && response.status !== "requested")) {
        return invalidResponse();
      }
      return { status: response.status };
    },
    async follow(communityId) {
      const response = await client.post_communitiesCommunityIdFollow(
        { path: { communityId } },
        mutationOptions(readCsrfToken),
      );
      if (response.community !== communityId || response.following !== true) return invalidResponse();
      return { following: true, followerCount: finiteCount(response.follower_count) };
    },
    async unfollow(communityId) {
      const response = await client.post_communitiesCommunityIdUnfollow(
        { path: { communityId } },
        mutationOptions(readCsrfToken),
      );
      if (response.community !== communityId || response.following !== false) return invalidResponse();
      return { following: false, followerCount: finiteCount(response.follower_count) };
    },
  };
}
