/** @jsxImportSource @solidjs/web */
import { CommunityNavigation } from "./community-navigation.tsx";
import { primaryNavigation, type CommunityNavigationState, type NavigationCommunity } from "./navigation-model.ts";

import { loadAccountCommunityMemberships, type AccountCommunityMembership } from "../../api/account-community-memberships.ts";

export type DrawerCommunity = NavigationCommunity;

export function drawerCommunityFromMembership(membership: AccountCommunityMembership): DrawerCommunity {
  return {
    communityId: membership.community_id,
    displayName: membership.display_name,
    href: membership.resource_href ?? membership.canonical_route?.href ?? null,
  };
}

export async function loadDrawerCommunities(): Promise<readonly DrawerCommunity[]> {
  return (await loadAccountCommunityMemberships()).map(drawerCommunityFromMembership);
}

export interface NavigationDrawerProps {
  readonly state: CommunityNavigationState;
  readonly currentPath?: string;
  readonly onNavigate: (href: string) => void;
  readonly onRetry: () => void;
}

/** Phone tabs already carry For You, Your Songs, Wallet and Profile. */
export function NavigationDrawer(props: NavigationDrawerProps) {
  const explore = primaryNavigation.find(item => item.id === "explore")!;
  return <nav aria-label="Community navigation" class="flex h-full min-h-0 flex-col gap-6 overflow-y-auto p-4 pt-[calc(env(safe-area-inset-top)+3.5rem)]">
    <a class="flex min-h-11 items-center rounded-lg px-3 py-2 text-sidebar-foreground hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={explore.href} aria-current={props.currentPath === explore.href ? "page" : undefined} onClick={event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); props.onNavigate(explore.href);
    }}>{explore.label}</a>
    <CommunityNavigation state={props.state} currentPath={props.currentPath} onNavigate={props.onNavigate} onRetry={props.onRetry} />
    <div class="mt-auto flex gap-4 px-3 py-3 text-xs text-sidebar-foreground"><a href="/terms">Terms</a><a href="/privacy">Privacy</a></div>
  </nav>;
}
