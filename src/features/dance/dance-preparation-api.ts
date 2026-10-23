import { ApiClientError, type PirateApiClient } from "@pirate/api-client";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions } from "../../api/client.ts";
import { captureSessionAuthority, isCurrentSessionAuthority } from "../../api/browser-session-events.ts";

type PreparationClient = Pick<PirateApiClient,
  | "get_usersMe"
  | "get_communitiesCommunityIdMeCapabilities"
  | "post_communitiesCommunityIdActivityPersonasPrepare"
  | "get_communitiesCommunityIdPostsPostIdDanceModeratedOptions"
  | "get_communitiesCommunityIdPostsPostIdDanceModeratedChoreographiesChoreographyIdRevisionsRevisionLatestReview"
  | "post_communitiesCommunityIdDanceModeratedSessions"
  | "post_communitiesCommunityIdDanceModeratedSessionsSessionIdConsent"
  | "get_communitiesCommunityIdDanceModeratedSessionsSessionId"
  | "get_communitiesCommunityIdDanceModeratedSessionsSessionIdCaptureContext"
>;
type Input<K extends keyof PreparationClient> = Parameters<PreparationClient[K]>[0];
type Reply<K extends keyof PreparationClient> = Awaited<ReturnType<PreparationClient[K]>>;

export interface DancePreparationScope {
  readonly accountId: string;
  readonly communityId: string;
  readonly postId: string;
}
export interface DanceRevision {
  readonly choreographyId: string;
  readonly revision: number;
}
export type DanceCreateCommand = Input<"post_communitiesCommunityIdDanceModeratedSessions">["body"];
export type DanceConsentCommand = Input<"post_communitiesCommunityIdDanceModeratedSessionsSessionIdConsent">["body"];
export type DanceCaptureContext = Reply<"get_communitiesCommunityIdDanceModeratedSessionsSessionIdCaptureContext">;
export type DanceSession = Reply<"get_communitiesCommunityIdDanceModeratedSessionsSessionId">;
export type DancePreparationOptions = Reply<"get_communitiesCommunityIdPostsPostIdDanceModeratedOptions">;

function sameSession(scope: DancePreparationScope, session: DanceSession, sessionId?: string, termsHash?: string) {
  if (session.community_id !== scope.communityId || session.song_post_id !== scope.postId
    || (sessionId !== undefined && session.session_id !== sessionId)
    || (termsHash !== undefined && session.terms_hash !== termsHash)) throw new Error("dance_preparation_target_changed");
}

/** Account and page-epoch fenced preparation only. No camera, upload, owner
 * verdict or practice-mode override is reachable through this adapter. */
export function createDancePreparationApi(provided?: PreparationClient, csrf: () => string | undefined = readCsrfCookie) {
  const authority = captureSessionAuthority();
  const current = (signal: AbortSignal) => {
    signal.throwIfAborted();
    if (!isCurrentSessionAuthority(authority)) throw new Error("dance_preparation_session_changed");
  };
  const writeOptions = (signal: AbortSignal) => {
    current(signal);
    const token = csrf();
    current(signal);
    if (!token) throw new Error("dance_preparation_csrf_unavailable");
    return sessionRequestOptions(token, { signal });
  };
  const guarded = async <T>(scope: DancePreparationScope, signal: AbortSignal,
    invoke: (api: PreparationClient) => Promise<T>, validate: (result: T) => void): Promise<T> => {
    const expected = { ...scope };
    current(signal);
    const api = provided ?? createSessionApiClient();
    const identity = async () => {
      current(signal);
      const user = await api.get_usersMe(undefined, { signal });
      current(signal);
      if (user.id !== expected.accountId) throw new Error("dance_preparation_account_changed");
    };
    await identity();
    current(signal);
    const result = await invoke(api);
    current(signal);
    await identity();
    validate(result);
    current(signal);
    return result;
  };
  return {
    owner(scope: DancePreparationScope, signal: AbortSignal) {
      scope = { ...scope };
      return guarded(scope, signal, async api => {
        try {
          const role = await api.get_communitiesCommunityIdMeCapabilities({ path: { communityId: scope.communityId } }, { signal });
          if (role.community_id !== scope.communityId || role.role !== "owner") throw new Error("dance_preparation_target_changed");
          return true;
        } catch (error) {
          if (error instanceof ApiClientError && error.declaredName === "NotFound") return false;
          throw error;
        }
      }, () => {});
    },
    preparePersona(scope: DancePreparationScope, body: Input<"post_communitiesCommunityIdActivityPersonasPrepare">["body"], signal: AbortSignal) {
      scope = { ...scope };
      body = { ...body, choice: { ...body.choice } };
      return guarded(scope, signal, api => api.post_communitiesCommunityIdActivityPersonasPrepare({ path: { communityId: scope.communityId }, body }, writeOptions(signal)), result => {
        if (result.community_id !== scope.communityId || (result.activity_presentation !== null
          && (result.activity_presentation.community_id !== scope.communityId || result.activity_presentation.persona_id !== result.persona_id))
          || (body.choice.kind === "existing" && result.persona_id !== body.choice.persona_id)) throw new Error("dance_preparation_target_changed");
      });
    },
    options(scope: DancePreparationScope, cursor: string | undefined, signal: AbortSignal) {
      scope = { ...scope };
      return guarded(scope, signal, api => api.get_communitiesCommunityIdPostsPostIdDanceModeratedOptions({ path: { communityId: scope.communityId, postId: scope.postId }, query: cursor === undefined ? {} : { cursor } }, { signal }), result => {
        if (result.community_id !== scope.communityId || result.song_post_id !== scope.postId) throw new Error("dance_preparation_target_changed");
      });
    },
    latest(scope: DancePreparationScope, target: DanceRevision, signal: AbortSignal) {
      scope = { ...scope };
      target = { ...target };
      return guarded(scope, signal, api => api.get_communitiesCommunityIdPostsPostIdDanceModeratedChoreographiesChoreographyIdRevisionsRevisionLatestReview({ path: { communityId: scope.communityId, postId: scope.postId, choreographyId: target.choreographyId, revision: String(target.revision) } }, { signal }), result => {
        const review = result.latest_submitted;
        if (review !== null && (review.community_id !== scope.communityId || review.song_post_id !== scope.postId
          || review.choreography_id !== target.choreographyId || review.choreography_revision !== target.revision)) throw new Error("dance_preparation_target_changed");
      });
    },
    /** The caller must durably save the exact body/key before dispatch. A replay
     * receipt is historical: reconcile the current session before advancing. */
    create(scope: DancePreparationScope, body: DanceCreateCommand, signal: AbortSignal) {
      scope = { ...scope };
      body = { ...body };
      if (body.community_id !== scope.communityId || body.song_post_id !== scope.postId) return Promise.reject(new Error("dance_preparation_target_changed"));
      return guarded(scope, signal, api => api.post_communitiesCommunityIdDanceModeratedSessions({ path: { communityId: scope.communityId }, body }, writeOptions(signal)), result => {
        sameSession(scope, result.session);
        if (result.operation !== "create" || result.session.choreography_id !== body.choreography_id
          || result.session.choreography_revision !== body.choreography_revision
          || result.session.policy_hash !== body.expected_policy_hash) throw new Error("dance_preparation_target_changed");
      });
    },
    /** One explicit Start intent may await this acknowledged receipt before
     * capture; it is not a Terms/Privacy document-version acceptance ledger. */
    consent(scope: DancePreparationScope, body: DanceConsentCommand, signal: AbortSignal) {
      scope = { ...scope };
      body = { ...body };
      if (body.community_id !== scope.communityId) return Promise.reject(new Error("dance_preparation_target_changed"));
      return guarded(scope, signal, api => api.post_communitiesCommunityIdDanceModeratedSessionsSessionIdConsent({ path: { communityId: scope.communityId, sessionId: body.session_id }, body }, writeOptions(signal)), result => {
        sameSession(scope, result.session, body.session_id, body.terms_hash);
        if (result.operation !== "consent" || result.session.consent_version !== body.consent_version
          || result.session.consent_hash !== body.consent_hash || result.session.retention_hash !== body.retention_hash) throw new Error("dance_preparation_target_changed");
      });
    },
    session(scope: DancePreparationScope, sessionId: string, signal: AbortSignal) {
      scope = { ...scope };
      return guarded(scope, signal, api => api.get_communitiesCommunityIdDanceModeratedSessionsSessionId({ path: { communityId: scope.communityId, sessionId } }, { signal }), result => sameSession(scope, result, sessionId));
    },
    context(scope: DancePreparationScope, sessionId: string, signal: AbortSignal) {
      scope = { ...scope };
      return guarded(scope, signal, api => api.get_communitiesCommunityIdDanceModeratedSessionsSessionIdCaptureContext({ path: { communityId: scope.communityId, sessionId } }, { signal }), result => sameSession(scope, result.session, sessionId));
    },
  };
}
