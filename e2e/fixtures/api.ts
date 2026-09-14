import { expect, type Page } from "playwright/test";
import type {
  GetCommunityCreationIntentsIntentIdResponse,
  GetCommunitiesCommunityIdPreviewResponse,
  GetCommunitiesCommunityIdMeCapabilitiesResponse,
  GetPersonasResponse,
  GetUsersMeCommunityMembershipsResponse,
} from "@pirate/api-client";

export type JsonRecord = Readonly<Record<string, unknown>>;

function jsonRecord(value: unknown): JsonRecord {
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
  expect(typeof value).toBe("object");
  return value as JsonRecord;
}

async function get<T = JsonRecord>(page: Page, path: string, params?: Record<string, string>): Promise<T> {
  if (!path.startsWith("/api/") || path.includes("?") || path.includes("#")) {
    throw new Error("Readonly E2E API paths must be canonical same-origin /api paths");
  }
  const response = await page.request.get(path, { params });
  expect(response.status(), `GET ${path}`).toBe(200);
  return jsonRecord(await response.json()) as T;
}

/** Read-only API assertions that share the browser's host-only session. */
export function readonlyApi(page: Page) {
  return {
    currentUser: () => get(page, "/api/users/me"),
    homeFeed: () => get(page, "/api/feed/home"),
    creationIntent: (intentId: string) => get<GetCommunityCreationIntentsIntentIdResponse>(
      page, `/api/community-creation-intents/${encodeURIComponent(intentId)}`,
    ),
    communityPreview: (communityId: string) => get<GetCommunitiesCommunityIdPreviewResponse>(
      page, `/api/communities/${encodeURIComponent(communityId)}/preview`,
    ),
    personas: () => get<GetPersonasResponse>(page, "/api/personas"),
    ownerCapabilities: (communityId: string) => get<GetCommunitiesCommunityIdMeCapabilitiesResponse>(
      page, `/api/communities/${encodeURIComponent(communityId)}/me/capabilities`,
    ),
    membership: async (communityId: string) => {
      let cursor: string | null = null;
      const seen = new Set<string>();
      for (let index = 0; index < 100; index++) {
        const result: GetUsersMeCommunityMembershipsResponse = await get(
          page, "/api/users/me/community-memberships",
          { limit: "100", ...(cursor ? { cursor } : {}) },
        );
        const membership = result.items.find(item => item.community_id === communityId);
        if (membership || result.next_cursor === null) return membership;
        cursor = result.next_cursor;
        if (seen.has(cursor)) throw new Error("Membership API repeated a pagination cursor");
        seen.add(cursor);
      }
      throw new Error("Membership API exceeded the acceptance pagination limit");
    },
    joinEligibility: (communityId: string) => get(
      page,
      `/api/communities/${encodeURIComponent(communityId)}/join-eligibility`,
    ),
  } as const;
}
