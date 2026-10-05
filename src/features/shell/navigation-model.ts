/** One destination map for desktop, the mobile drawer and the four mobile tabs. */
export const navigationPaths = {
  home: "/", explore: "/explore", songs: "/songs",
  wallet: "/wallet", profile: "/me",
} as const;

const paths = new Map<string, string>(Object.entries(navigationPaths));

export function navigationPath(id: string): string | undefined {
  return paths.get(id);
}

/** The public page for a profile: its handle when it has one, else its id. */
export function profilePath(profile: { readonly personaId: string; readonly publicHandle?: string | null }): string {
  const handle = profile.publicHandle?.trim();
  return handle ? `/u/${encodeURIComponent(handle)}` : `/p/${encodeURIComponent(profile.personaId)}`;
}

export type ProfileSwitch =
  | { readonly kind: "none" }
  | { readonly kind: "toggle"; readonly personaId: string }
  | { readonly kind: "open" };

/**
 * What a double tap on the profile tab does: nothing with one profile, a
 * direct toggle with two, and the profile sheet with three or more.
 */
export function profileSwitch(personaIds: readonly string[], selectedPersonaId: string | undefined): ProfileSwitch {
  if (personaIds.length < 2) return { kind: "none" };
  if (personaIds.length > 2) return { kind: "open" };
  // With no explicit selection the first profile is the one in use.
  const current = selectedPersonaId !== undefined && personaIds.includes(selectedPersonaId) ? selectedPersonaId : personaIds[0];
  const other = personaIds.find(personaId => personaId !== current) ?? personaIds[0]!;
  return { kind: "toggle", personaId: other };
}

export const primaryNavigation = [
  { id: "home", label: "For You", href: navigationPaths.home },
  { id: "explore", label: "Explore", href: navigationPaths.explore },
  { id: "songs", label: "Your Songs", href: navigationPaths.songs },
  { id: "wallet", label: "Wallet", href: navigationPaths.wallet },
  { id: "profile", label: "Profile", href: navigationPaths.profile },
] as const;

export function primaryNavigationLabel(id: typeof primaryNavigation[number]["id"]) {
  return primaryNavigation.find(item => item.id === id)!.label;
}

export interface NavigationCommunity {
  readonly communityId: string;
  readonly displayName: string;
  readonly href: string | null;
}

/** Supply popular entries in descending member-count order. */
export interface CommunityNavigationData {
  readonly joined: readonly NavigationCommunity[];
  readonly popular: readonly NavigationCommunity[];
  /** Communities created by the viewer; this projection grants no moderation access. */
  readonly created: readonly NavigationCommunity[];
}

export type CommunityNavigationState =
  | { readonly kind: "hidden" }
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "ready"; readonly data: CommunityNavigationData };

export const sidebarCommunityLimit = 5;

function uniqueCommunities(communities: readonly NavigationCommunity[], excluded = new Set<string>()) {
  const seen = new Set(excluded);
  return communities.filter(community => {
    if (seen.has(community.communityId)) return false;
    seen.add(community.communityId);
    return true;
  });
}

/** One projection for the desktop sidebar and phone drawer, with no recents. */
export function communityNavigationSections(data: CommunityNavigationData, limit = sidebarCommunityLimit) {
  const created = uniqueCommunities(data.created);
  const createdIds = new Set(created.map(community => community.communityId));
  const joined = uniqueCommunities(data.joined, createdIds);
  const popular = uniqueCommunities(data.popular, new Set([...createdIds, ...joined.map(community => community.communityId)]));
  const communities = [...joined, ...popular];
  return {
    communities: communities.slice(0, limit),
    created,
    // Keep overflow reachable without adding a redundant link to short lists.
    seeAllJoined: joined.length > limit,
  };
}


/** Host scope is supplied by verified application context, never a route guess. */
export type ApplicationNavigationScope =
  | { readonly kind: "platform" }
  | {
      readonly kind: "community";
      readonly community: NavigationCommunity;
      /** Present only after current-community moderation access resolves. */
      readonly moderationHref?: string;
    };

export const platformNavigationScope: ApplicationNavigationScope = { kind: "platform" };

export function navigationHomePath(scope: ApplicationNavigationScope): string {
  return scope.kind === "community" ? scope.community.href ?? "/" : navigationPaths.home;
}

export function scopedPrimaryNavigation(scope: ApplicationNavigationScope) {
  return primaryNavigation
    .filter(item => scope.kind === "platform" || item.id !== "explore")
    .map(item => ({ ...item, label: item.id === "home" && scope.kind === "community" ? "Home" : item.label, href: item.id === "home" ? navigationHomePath(scope) : item.href }));
}
