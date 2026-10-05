/** @jsxImportSource @solidjs/web */
import { Show } from "solid-js";
import { Type } from "../../design-system";
import { CommunityNavigation } from "./community-navigation.tsx";
import { scopedPrimaryNavigation, platformNavigationScope, type CommunityNavigationState, type NavigationCommunity, type ApplicationNavigationScope } from "./navigation-model.ts";

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
  return (await loadAccountCommunityMemberships({ itemLimit: 6, pageLimit: 6 })).map(drawerCommunityFromMembership);
}

export interface NavigationDrawerProps {
  readonly state: CommunityNavigationState;
  readonly scope?: ApplicationNavigationScope;
  readonly currentPath?: string;
  readonly onNavigate: (href: string) => void;
  readonly onRetry: () => void;
}

/** Phone tabs already carry For You, Your Songs, Wallet and Profile. */
export function NavigationDrawer(props: NavigationDrawerProps) {
  const destination = () => scopedPrimaryNavigation(props.scope ?? platformNavigationScope).find(item => item.id === ("home"))!;
  return <nav aria-label="Community navigation" class="flex h-full min-h-0 flex-col gap-6 overflow-y-auto p-4 pt-[calc(env(safe-area-inset-top)+3.5rem)]">
    <Show when={props.scope?.kind === "community" ? props.scope : undefined}>{scope => <Type variant="h4" class="px-3">{scope().community.displayName}</Type>}</Show>
    <Show when={props.scope?.kind === "community"}><a class="flex min-h-11 items-center rounded-lg px-3 py-2 text-sidebar-foreground hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={destination().href} aria-current={props.currentPath === destination().href ? "page" : undefined} onClick={event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); props.onNavigate(destination().href);
    }}>{destination().label}</a></Show>
    <CommunityNavigation state={props.state} scope={props.scope} currentPath={props.currentPath} onNavigate={props.onNavigate} onRetry={props.onRetry} />
  </nav>;
}
