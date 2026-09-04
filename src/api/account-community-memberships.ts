import type { GetUsersMeCommunityMembershipsResponse, PirateApiClient } from "@pirate/api-client";

import { createSessionApiClient, type ApiClientFactoryOptions } from "./client.ts";

export type AccountCommunityMembership = GetUsersMeCommunityMembershipsResponse["items"][number];

export type AccountCommunityMembershipClient = Pick<
  PirateApiClient,
  "get_usersMeCommunityMemberships"
>;

export class AccountCommunityMembershipProjectionError extends Error {
  constructor() {
    super("invalid_account_community_membership_projection");
    this.name = "AccountCommunityMembershipProjectionError";
  }
}

export interface LoadAccountCommunityMembershipsOptions extends ApiClientFactoryOptions {
  readonly client?: AccountCommunityMembershipClient;
  readonly pageLimit?: number;
  readonly maxPages?: number;
}

function hasAsciiControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return true;
  }
  return false;
}

function validId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    !hasAsciiControl(value)
  );
}

function validCursor(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 1_024 &&
    value.trim() === value &&
    !hasAsciiControl(value)
  );
}

function validPath(value: string): boolean {
  return value.startsWith("/c/") && !value.includes("?") && !value.includes("#");
}

function projectMembership(value: AccountCommunityMembership): AccountCommunityMembership {
  if (
    value.object !== "account_community_membership" ||
    !validId(value.community_id) ||
    value.display_name.length === 0 ||
    value.display_name.includes("\u0000") ||
    value.membership_status !== "member" ||
    value.can_post !== true ||
    (value.resource_href !== null && !validPath(value.resource_href)) ||
    (value.canonical_route !== null && !validPath(value.canonical_route.href))
  ) {
    throw new AccountCommunityMembershipProjectionError();
  }
  return value;
}

/** Load the frozen account membership set without leaking cursor state into UI code. */
export async function loadAccountCommunityMemberships(
  options: LoadAccountCommunityMembershipsOptions = {},
): Promise<readonly AccountCommunityMembership[]> {
  const pageLimit = options.pageLimit ?? 100;
  const maxPages = options.maxPages ?? 100;
  if (
    !Number.isSafeInteger(pageLimit) ||
    pageLimit < 1 ||
    pageLimit > 100 ||
    !Number.isSafeInteger(maxPages) ||
    maxPages < 1
  ) {
    throw new TypeError("invalid account community membership pagination options");
  }
  const client = options.client ?? createSessionApiClient(options);
  const items: AccountCommunityMembership[] = [];
  const communityIds = new Set<string>();
  const cursors = new Set<string>();
  let cursor: string | null = null;

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const limit = String(pageLimit);
    const page: GetUsersMeCommunityMembershipsResponse =
      cursor === null
        ? await client.get_usersMeCommunityMemberships({ query: { limit } })
        : await client.get_usersMeCommunityMemberships({ query: { cursor, limit } });
    if (page.object !== "account_community_membership_page" || !Array.isArray(page.items)) {
      throw new AccountCommunityMembershipProjectionError();
    }
    for (const value of page.items) {
      const item = projectMembership(value);
      if (communityIds.has(item.community_id))
        throw new AccountCommunityMembershipProjectionError();
      communityIds.add(item.community_id);
      items.push(item);
    }
    if (page.next_cursor === null) return items;
    if (!validCursor(page.next_cursor) || cursors.has(page.next_cursor)) {
      throw new AccountCommunityMembershipProjectionError();
    }
    cursors.add(page.next_cursor);
    cursor = page.next_cursor;
  }
  throw new AccountCommunityMembershipProjectionError();
}
