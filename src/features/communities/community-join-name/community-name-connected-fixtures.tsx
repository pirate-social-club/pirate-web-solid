import { onCleanup } from "solid-js";
import { ActivePersonaProvider } from "../../identity/active-persona-store.tsx";
import { ApplicationSessionProvider } from "../../shell/application-session.tsx";
import { ApplicationChrome } from "../../shell/media-shell/media-shell.tsx";
import CommunityPage from "../community-page/community-page.tsx";
import type { CommunityPageSuccess } from "../community-page/community-page.model.ts";
import type { AuthenticatedSession } from "../../../api/session.ts";
import { communityNameStorageKey } from "./community-name-acquisition.ts";
import { offering, communityId, personaId, label, confirmation, quote, reservation, claim } from "./community-name-test-fixtures.ts";

/** Production page, controllers and chrome, with explicit in-memory API ports. */
export function ConnectedJourney(props: { member?: boolean }) {
  let joined = props.member ?? false;
  const session: AuthenticatedSession = { status: "authenticated", userId: "connected-preview-account", personas: [{ personaId, displayName: "Member", avatarRef: null, primaryPublicHandle: null,
    communityBinding: { communityId, bindingSource: "first_membership" } }] };
  const storageKey = communityNameStorageKey(session.userId, communityId);
  const previous = sessionStorage.getItem(storageKey);
  sessionStorage.removeItem(storageKey);
  onCleanup(() => { if (previous === null) sessionStorage.removeItem(storageKey); else sessionStorage.setItem(storageKey, previous); });
  const state: CommunityPageSuccess = { kind: "success", status: 200, requestedPathSegment: "charizard", canonicalPath: "/c/charizard", canonicalUrl: "/c/charizard",
    routeFamily: "hns", routeDisplay: "charizard", communityId, initialFeed: { kind: "ready", posts: [] },
    community: { displayName: "Night Shift", description: "Music, ideas, and people building after dark.", membershipMode: "open", memberCount: 1270, followerCount: 18400, rules: [] } };
  return <ApplicationSessionProvider state={() => session}><ActivePersonaProvider><ApplicationChrome signedIn viewerId={session.userId} currentPath="/c/charizard"
    selectedPersonaId={personaId} personas={[{ personaId, displayName: "Member" }]}
    navigationScope={{ kind: "community", community: { communityId, displayName: "Night Shift", href: "/c/charizard" } }}
    communityNavigation={{ kind: "ready", data: { popular: [], joined: [], moderated: [] } }} navigate={() => {}}>
    <CommunityPage pathSegment="charizard" data={state} resolveSession={async () => session} resolveOwnerSettingsAccess={async () => false}
      loadThreads={async () => ({ posts: [], nextCursor: null })}
      engagementApi={{ readViewerState: async () => ({ membership: joined ? "member" : "not_member", following: false, followerCount: 18400 }),
        resolveJoinAction: async () => joined ? { kind: "joined" } : { kind: "join" },
        join: async () => { joined = true; return { status: "joined", personaId }; }, follow: async () => ({ following: true, followerCount: 18401 }), unfollow: async () => ({ following: false, followerCount: 18400 }) }}
      handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [offering], next_cursor: null }) }}
      nameClients={{ csrf: () => "fixture-csrf", claimPolling: { maxPolls: 0 },
        claimClient: { get_personas: async () => ({ personas: [] }), post_handlePersonaLinkConfirmations: async () => confirmation, post_handleQuotes: async () => quote,
          post_handleReservations: async () => reservation, post_handleClaims: async () => ({ claim: claim(), replayed: false }), get_handleClaimsClaimId: async () => claim() },
        grantClient: { get_personasPersonaIdHandleGrants: async () => ({ items: [], next_cursor: null }), get_handlesFamilyNamespaceRootHandleLabel: async () => ({ grant_id: "grant-1", grant_generation: 1, community_id: communityId,
          owner_persona: { persona_id: personaId, object: "persona", display_name: null, avatar_ref: null, primary_public_handle: `${label}.charizard` },
          sale_namespace_activation_id: offering.sale_namespace_activation_id, sale_namespace_activation_generation: 3, fulfillment: { kind: "hosted_persona_v1" },
          handle: { family: "hns", namespace_root: "charizard", handle_label: label }, display_identifier: `${label}.charizard`,
          host: { kind: "available", normalized_host: `${label}.charizard`, sale_namespace_activation_generation: 3, grant_generation: 1 }, issued_at: "2026-08-26T12:00:01Z" }) } }}
    />
  </ApplicationChrome></ActivePersonaProvider></ApplicationSessionProvider>;
}

