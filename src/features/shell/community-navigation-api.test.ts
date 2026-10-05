import { expect, test, vi } from "vitest";
import { loadCommunityAppNavigation, loadCommunityNavigation } from "./community-navigation-api.ts";
import { communityNavigationSections } from "./navigation-model.ts";

const popular = { object: "popular_community_list" as const, ranked_by: "members" as const, items: [
  { community_id: "popular", display_name: "Popular", resource_href: "/c/popular", member_count: 20 },
  { community_id: "joined", display_name: "Joined", resource_href: "/c/joined", member_count: 10 },
] };
test("anonymous discovery invokes only the public read", async () => {
  const discovery = vi.fn(async () => popular);
  const moderation = vi.fn(); const joined = vi.fn();
  const data = await loadCommunityNavigation(false, { publicClient: { get_publicCommunitiesPopular: discovery }, accountClient: { get_usersMeModerationCommunities: moderation }, joined });
  expect(discovery).toHaveBeenCalledWith({ query: { limit: "20" } });
  expect(moderation).not.toHaveBeenCalled(); expect(joined).not.toHaveBeenCalled();
  expect(data.popular.map(item => item.communityId)).toEqual(["popular", "joined"]);
  expect(data.moderated).toEqual([]);
});
test("resolved account reads feed the shared joined-first and moderator projections", async () => {
  const data = await loadCommunityNavigation(true, {
    publicClient: { get_publicCommunitiesPopular: async () => popular },
    joined: async () => [{ communityId: "joined", displayName: "Joined", href: "/c/joined" }],
    accountClient: { get_usersMeModerationCommunities: async () => ({ object: "moderation_community_page", capability: "moderation.view", next_cursor: null, items: [{ community_id: "moderated", display_name: "Moderated", resource_href: "/c/moderated", member_count: 1 }] }) },
  });
  const sections = communityNavigationSections(data);
  expect(sections.communities.map(item => item.communityId)).toEqual(["joined", "popular"]);
  expect(sections.moderated.map(item => item.communityId)).toEqual(["moderated"]);
});
test("permission-read failure is not presented as a successful empty moderator list", async () => {
  await expect(loadCommunityNavigation(true, {
    publicClient: { get_publicCommunitiesPopular: async () => popular }, joined: async () => [],
    accountClient: { get_usersMeModerationCommunities: async () => { throw new Error("unavailable"); } },
  })).rejects.toThrow("unavailable");
});

test("a community app retains only its own server-confirmed moderation entry", async () => {
  const read = vi.fn(async () => ({ object: "moderation_community_page" as const, capability: "moderation.view" as const, next_cursor: null, items: [
    { community_id: "current", display_name: "Current", resource_href: "/c/current", member_count: 2 },
    { community_id: "external", display_name: "External", resource_href: "/c/external", member_count: 3 },
  ] }));
  const data = await loadCommunityAppNavigation("current", { get_usersMeModerationCommunities: read });
  expect(read).toHaveBeenCalledOnce(); expect(data.joined).toEqual([]); expect(data.popular).toEqual([]);
  expect(data.moderated.map(item => item.communityId)).toEqual(["current"]);
});
