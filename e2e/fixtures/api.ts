import { expect, type Page } from "playwright/test";

export type JsonRecord = Readonly<Record<string, unknown>>;

function jsonRecord(value: unknown): JsonRecord {
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
  expect(typeof value).toBe("object");
  return value as JsonRecord;
}

async function get(page: Page, path: string): Promise<JsonRecord> {
  if (!path.startsWith("/api/") || path.includes("?") || path.includes("#")) {
    throw new Error("Readonly E2E API paths must be canonical same-origin /api paths");
  }
  const response = await page.request.get(path);
  expect(response.status(), `GET ${path}`).toBe(200);
  return jsonRecord(await response.json());
}

/** Read-only API assertions that share the browser's host-only session. */
export function readonlyApi(page: Page) {
  return {
    currentUser: () => get(page, "/api/users/me"),
    homeFeed: () => get(page, "/api/feed/home"),
    joinEligibility: (communityId: string) => get(
      page,
      `/api/communities/${encodeURIComponent(communityId)}/join-eligibility`,
    ),
  } as const;
}
