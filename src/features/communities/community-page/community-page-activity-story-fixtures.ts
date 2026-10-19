import type { GetUsersMeResponse, GetPersonasResponse, GetPersonasPersonaIdHandleGrantsResponse, GetCommunitiesCommunityIdRewardsLeaderboardResponse, GetCommunitiesCommunityIdRewardsProgressResponse, GetCommunitiesCommunityIdRewardsPresentationPersonaResponse } from "@pirate/api-client";
import type { ApiFetch } from "../../../api/proxy.ts";
import { clearSession, refreshSession, type AuthenticatedSession } from "../../../api/session.ts";
import { progressFixture } from "../../activity/activity-contract-fixtures.ts";

/** Story-only HTTP fixtures; the mounted activity still uses generated validation. */
export function communityActivityStoryFetch(communityId: string, session: AuthenticatedSession, assets: ApiFetch): ApiFetch {
  const user: GetUsersMeResponse = {
    id: session.userId, object: "user", verification_state: "unverified", created: 1792108800,
    verification_capabilities: { unique_human: { state: "unverified" }, age_over_18: { state: "unverified" }, minimum_age: { state: "unverified" }, nationality: { state: "unverified" }, gender: { state: "unverified" }, wallet_score: { state: "unverified" } },
  };
  const personas: GetPersonasResponse = { personas: session.personas.map(persona => ({
    object: "persona", persona_id: persona.personaId, status: "active", created_at: "2026-10-16T00:00:00Z", retired_at: null,
    wallet_set: { evm: null }, community_binding: persona.communityBinding === null ? null : { community_id: persona.communityBinding.communityId, binding_source: persona.communityBinding.bindingSource },
    profile: { object: "persona_profile", persona_id: persona.personaId, revision: 1, display_name: persona.displayName, avatar_ref: persona.avatarRef, cover_ref: null, bio: null, preferred_locale: null, primary_public_handle: persona.primaryPublicHandle },
  })) };
  const board: GetCommunitiesCommunityIdRewardsLeaderboardResponse = { object: "activity_streak_leaderboard", scope: { kind: "community", community_id: communityId }, day_semantics: "account_pinned_iana_timezone_v1", entries: [], viewer_standing: null };
  const progress: GetCommunitiesCommunityIdRewardsProgressResponse = { ...progressFixture, scope: { kind: "community", community_id: communityId }, standing: null };
  const presentation: GetCommunitiesCommunityIdRewardsPresentationPersonaResponse = { object: "activity_presentation_state", community_id: communityId, observed_at: progress.observed_at, selection: { status: "unset" } };
  const grants: GetPersonasPersonaIdHandleGrantsResponse = { items: [], next_cursor: null };
  const activityPath = `/api/communities/${encodeURIComponent(communityId)}/rewards`;
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
    if (!url.pathname.startsWith("/api/")) return assets(input, init);
    if ((init?.method ?? "GET") !== "GET") throw new Error(`No story fixture for ${init?.method} ${url.pathname}`);
    if (url.pathname === "/api/users/me") return Response.json(user);
    if (url.pathname === "/api/personas") return Response.json(personas);
    if (session.personas.some(persona => url.pathname === `/api/personas/${encodeURIComponent(persona.personaId)}/handle-grants`)) return Response.json(grants);
    if (url.pathname === `${activityPath}/leaderboard`) return Response.json(board);
    if (url.pathname === `${activityPath}/progress`) return Response.json(progress);
    if (url.pathname === `${activityPath}/presentation-persona`) return Response.json(presentation);
    throw new Error(`No story fixture for GET ${url.pathname}`);
  };
}

/** Restore the per-story HTTP fixtures when Storybook switches stories. */
export function installCommunityActivityStoryFixture(communityId: string, session: AuthenticatedSession) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "fetch")!;
  const fixture = communityActivityStoryFetch(communityId, session, fetch);
  Object.defineProperty(globalThis, "fetch", { ...previous, value: fixture });
  clearSession(); refreshSession();
  return () => { clearSession(); refreshSession(); Object.defineProperty(globalThis, "fetch", previous); };
}
