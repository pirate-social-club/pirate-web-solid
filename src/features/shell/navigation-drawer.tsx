/** @jsxImportSource @solidjs/web */
import { For, Show } from "solid-js";

import { Avatar, Button, IconCheck, IconGearSix, IconPlus, Type, cn } from "../../design-system";
import { loadAccountCommunityMemberships, type AccountCommunityMembership } from "../../api/account-community-memberships.ts";
import type { SwitchablePersona } from "../identity/persona-switcher-sheet/persona-switcher-sheet.tsx";

/** A community the account belongs to, as the drawer lists it. */
export interface DrawerCommunity {
  readonly communityId: string;
  readonly displayName: string;
  readonly href: string | null;
}

export type DrawerCommunitiesState =
  | { readonly kind: "idle" | "loading" | "error" }
  | { readonly kind: "ready"; readonly communities: readonly DrawerCommunity[] };

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
  readonly signedIn: boolean;
  readonly personas: readonly SwitchablePersona[];
  readonly selectedPersonaId?: string;
  readonly communities: DrawerCommunitiesState;
  readonly onSelectPersona: (personaId: string) => void;
  readonly onOpenCommunity: (href: string) => void;
  readonly onCreateCommunity: () => void;
  readonly onSettings: () => void;
  readonly onSignIn: () => void;
  readonly onRetryCommunities: () => void;
}

function SectionHeading(props: { id: string; children: string }) {
  return <Type as="h2" id={props.id} variant="overline" class="px-3 pb-1 text-muted-foreground">{props.children}</Type>;
}

/**
 * The phone drawer. The footer already carries Home, Your songs, Wallet and
 * Profile, so the drawer holds what the footer cannot: the viewer's profiles,
 * the communities each one belongs to, and the communities the account has
 * joined.
 */
export function NavigationDrawer(props: NavigationDrawerProps) {
  const communityName = (communityId: string | null | undefined) => {
    if (!communityId || props.communities.kind !== "ready") return undefined;
    return props.communities.communities.find(community => community.communityId === communityId)?.displayName;
  };
  return (
    <nav aria-label="Profiles and communities" class="flex h-full min-h-0 flex-col gap-6 overflow-y-auto p-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
      <section aria-labelledby="drawer-profiles">
        <SectionHeading id="drawer-profiles">Profiles</SectionHeading>
        <Show
          when={props.signedIn}
          fallback={<div class="flex flex-col items-start gap-3 px-3 pt-2"><Type>Sign in to see your profiles and communities.</Type><Button onClick={props.onSignIn}>Sign in</Button></div>}
        >
          <Show when={props.personas.length > 0} fallback={<Type class="px-3 pt-2 text-muted-foreground">No profiles yet.</Type>}>
            <ul class="flex flex-col gap-1">
              <For each={props.personas}>
                {(persona) => {
                  const selected = () => persona.personaId === props.selectedPersonaId;
                  const detail = () => {
                    const community = communityName(persona.communityId);
                    return community ? `In ${community}` : persona.publicHandle ?? undefined;
                  };
                  return (
                    <li>
                      <button
                        aria-current={selected() ? "true" : undefined}
                        class={cn("flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-start transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected() && "bg-sidebar-accent")}
                        onClick={() => props.onSelectPersona(persona.personaId)}
                        type="button"
                      >
                        <span aria-hidden="true"><Avatar fallback={persona.displayName} fallbackSeed={persona.avatarSeed ?? persona.displayName} size="sm" src={persona.avatarSrc ?? undefined} /></span>
                        <span class="min-w-0 flex-1">
                          <Type as="span" variant="body-strong" class="block truncate">{persona.displayName}</Type>
                          <Show when={detail()}>{text => <Type as="span" variant="caption" class="block truncate">{text()}</Type>}</Show>
                        </span>
                        <Show when={selected()}><IconCheck aria-label="Current profile" class="size-5 text-primary" /></Show>
                      </button>
                    </li>
                  );
                }}
              </For>
            </ul>
          </Show>
        </Show>
      </section>

      <Show when={props.signedIn}>
        <section aria-labelledby="drawer-communities">
          <SectionHeading id="drawer-communities">Communities</SectionHeading>
          <Show when={props.communities.kind === "loading" || props.communities.kind === "idle"}><Type class="px-3 pt-2 text-muted-foreground" role="status">Loading communities…</Type></Show>
          <Show when={props.communities.kind === "error"}>
            <div class="flex flex-col items-start gap-2 px-3 pt-2"><Type role="alert">Your communities could not be loaded.</Type><Button onClick={props.onRetryCommunities} size="sm" variant="outline">Try again</Button></div>
          </Show>
          <Show when={props.communities.kind === "ready" ? props.communities.communities : undefined}>
            {(communities) => (
              <Show when={communities().length > 0} fallback={<Type class="px-3 pt-2 text-muted-foreground">You haven't joined a community yet.</Type>}>
                <ul class="flex flex-col gap-1">
                  <For each={communities()}>
                    {(community) => (
                      <li>
                        <button
                          class="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-start transition-colors hover:bg-sidebar-accent disabled:cursor-default disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          disabled={community.href === null}
                          onClick={() => { if (community.href !== null) props.onOpenCommunity(community.href); }}
                          type="button"
                        >
                          <span aria-hidden="true"><Avatar fallback={community.displayName} fallbackSeed={community.displayName} size="sm" /></span>
                          <Type as="span" class="min-w-0 flex-1 truncate">{community.displayName}</Type>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            )}
          </Show>
          <Button class="mt-2 w-full cursor-pointer justify-start" leadingIcon={<IconPlus class="size-4" />} onClick={props.onCreateCommunity} variant="outline">Create community</Button>
        </section>
      </Show>

      <div class="mt-auto border-t border-sidebar-border pt-4">
        <button class="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-start transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={props.onSettings} type="button">
          <IconGearSix class="size-5" />
          <Type as="span">Settings</Type>
        </button>
      </div>
    </nav>
  );
}
