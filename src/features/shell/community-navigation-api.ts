import type { GetPublicCommunitiesPopularResponse, PirateApiClient } from "@pirate/api-client";
import { createPublicApiClient, createSessionApiClient } from "../../api/client.ts";
import { loadDrawerCommunities } from "./navigation-drawer.tsx";
import type { CommunityNavigationData, NavigationCommunity } from "./navigation-model.ts";

type NavigationClient = Pick<PirateApiClient, "get_publicCommunitiesPopular" | "get_usersMeModerationCommunities">;
export interface CommunityNavigationDependencies {
  readonly publicClient: Pick<NavigationClient, "get_publicCommunitiesPopular">;
  readonly accountClient: Pick<NavigationClient, "get_usersMeModerationCommunities">;
  readonly joined: () => Promise<readonly NavigationCommunity[]>;
}

function community(item: GetPublicCommunitiesPopularResponse["items"][number]): NavigationCommunity {
  return { communityId: item.community_id, displayName: item.display_name, href: item.resource_href };
}

async function loadModerationCommunities(
  accountClient: Pick<NavigationClient, "get_usersMeModerationCommunities">,
  communityId?: string,
): Promise<readonly NavigationCommunity[]> {
  const entries: NavigationCommunity[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  while (true) {
    const page = await accountClient.get_usersMeModerationCommunities(cursor ? { query: { cursor } } : {});
    entries.push(...page.items.filter(item => communityId === undefined || item.community_id === communityId).map(community));
    if (communityId !== undefined && entries.length > 0 || page.next_cursor === null) return entries;
    if (cursors.has(page.next_cursor)) throw new Error("non_advancing_moderation_cursor");
    cursors.add(page.next_cursor);
    cursor = page.next_cursor;
  }
}

/** A verified community app reads only account permission facts for its own entry. */
export async function loadCommunityAppNavigation(
  communityId: string,
  accountClient: Pick<NavigationClient, "get_usersMeModerationCommunities"> = createSessionApiClient(),
): Promise<CommunityNavigationData> {
  return { joined: [], popular: [], moderated: await loadModerationCommunities(accountClient, communityId) };
}

/** Called after the browser resolves its session; private reads never run for visitors. */
export async function loadCommunityNavigation(
  signedIn: boolean,
  dependencies: CommunityNavigationDependencies = {
    publicClient: createPublicApiClient(),
    accountClient: createSessionApiClient(),
    joined: loadDrawerCommunities,
  },
): Promise<CommunityNavigationData> {
  const popular = dependencies.publicClient.get_publicCommunitiesPopular({ query: { limit: "20" } });
  if (!signedIn) return { joined: [], moderated: [], popular: (await popular).items.map(community) };
  const [discovery, joined, moderation] = await Promise.all([
    popular,
    dependencies.joined(),
    loadModerationCommunities(dependencies.accountClient),
  ]);
  return { joined, popular: discovery.items.map(community), moderated: moderation };
}
