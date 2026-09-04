import { describe, expect, test, vi } from "vitest";

import {
  AccountCommunityMembershipProjectionError,
  loadAccountCommunityMemberships,
  type AccountCommunityMembershipClient,
} from "./account-community-memberships.ts";

const membership = (communityId: string, route = false) => ({
  object: "account_community_membership" as const,
  community_id: communityId,
  display_name: communityId,
  resource_href: route ? `/c/${communityId}` : null,
  canonical_route: route
    ? {
        family: "spaces" as const,
        root_label: communityId,
        root_label_display: communityId,
        path_segment: communityId,
        href: `/c/${communityId}`,
        app_host: null,
      }
    : null,
  membership_status: "member" as const,
  can_post: true as const,
});

describe("account community memberships adapter", () => {
  test("walks cursor pages and preserves route-less posting memberships", async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        object: "account_community_membership_page",
        items: [membership("route-less")],
        next_cursor: "cursor-2",
      })
      .mockResolvedValueOnce({
        object: "account_community_membership_page",
        items: [membership("routed", true)],
        next_cursor: null,
      });
    const items = await loadAccountCommunityMemberships({
      client: { get_usersMeCommunityMemberships: get } satisfies AccountCommunityMembershipClient,
      pageLimit: 1,
    });

    expect(items.map((item) => item.community_id)).toEqual(["route-less", "routed"]);
    expect(items[0]?.resource_href).toBeNull();
    expect(get).toHaveBeenNthCalledWith(2, { query: { cursor: "cursor-2", limit: "1" } });
  });

  test("rejects duplicate communities and repeated cursors", async () => {
    const duplicate = vi
      .fn()
      .mockResolvedValueOnce({
        object: "account_community_membership_page",
        items: [membership("same")],
        next_cursor: "next",
      })
      .mockResolvedValueOnce({
        object: "account_community_membership_page",
        items: [membership("same")],
        next_cursor: null,
      });
    await expect(
      loadAccountCommunityMemberships({
        client: {
          get_usersMeCommunityMemberships: duplicate,
        } satisfies AccountCommunityMembershipClient,
      }),
    ).rejects.toBeInstanceOf(AccountCommunityMembershipProjectionError);

    const repeatedCursor = vi
      .fn()
      .mockResolvedValue({
        object: "account_community_membership_page",
        items: [],
        next_cursor: "next",
      });
    await expect(
      loadAccountCommunityMemberships({
        client: {
          get_usersMeCommunityMemberships: repeatedCursor,
        } satisfies AccountCommunityMembershipClient,
      }),
    ).rejects.toBeInstanceOf(AccountCommunityMembershipProjectionError);
  });

  test("rejects malformed route projections", async () => {
    const client = {
      get_usersMeCommunityMemberships: vi.fn().mockResolvedValue({
        object: "account_community_membership_page",
        items: [{ ...membership("broken"), resource_href: "https://legacy.example/c/broken" }],
        next_cursor: null,
      }),
    } satisfies AccountCommunityMembershipClient;
    await expect(loadAccountCommunityMemberships({ client })).rejects.toBeInstanceOf(
      AccountCommunityMembershipProjectionError,
    );
  });

  test("accepts the contract's full cursor bound", async () => {
    const cursor = "c".repeat(1_024);
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        object: "account_community_membership_page",
        items: [],
        next_cursor: cursor,
      })
      .mockResolvedValueOnce({
        object: "account_community_membership_page",
        items: [],
        next_cursor: null,
      });
    await expect(
      loadAccountCommunityMemberships({
        client: { get_usersMeCommunityMemberships: get } satisfies AccountCommunityMembershipClient,
      }),
    ).resolves.toEqual([]);
  });
});
