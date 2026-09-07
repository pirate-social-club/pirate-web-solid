import { describe, expect, test } from "vitest";
import { resolveOwnerSettingsPreflight, ownerSettingsResponseStatus } from "../features/community/owner-settings/owner-settings-preflight";
import { NAMES_ACTIVE } from "../features/community/owner-settings/community-names-settings-fixtures";

const communityId = "community_midnight";
const route = { community_id: communityId, canonical_route: {
  family: "hns", root_label: "midnight", root_label_display: "midnight", path_segment: "midnight", href: "/c/midnight", app_host: "app.midnight",
} };
const preview = { id: communityId, object: "community_preview", display_name: "Midnight", membership_mode: "open", human_verification_lane: null, moderators: [], membership_gate_summaries: [], rules: [], created: 1700000000 };
const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function fixture(ownerStatus = 200) {
  const requests: Request[] = [];
  return {
    requests,
    fetchImpl: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (path === "/c/midnight") return response(route);
      if (path.endsWith("/preview")) return response(preview);
      if (ownerStatus !== 200) return response({ error: { code: "auth_error", message: "Sign in required", retryable: false } }, ownerStatus);
      if (path.endsWith("/me/capabilities")) return response({ community_id: communityId, role: "owner", role_assignment_id: "owner-1", capabilities: ["moderation.view", "moderation.act"] });
      if (path.endsWith("/handle-sales-management")) return response(NAMES_ACTIVE.context);
      return response({ items: [], next_cursor: null });
    },
  };
}

describe("owner settings SSR preflight", () => {
  test("reads api-next directly and forwards the current cookie only to private probes", async () => {
    const { requests, fetchImpl } = fixture();
    const result = await resolveOwnerSettingsPreflight(new Request("https://web.test/c/midnight/settings/moderation_queue", {
      headers: { cookie: "__Host-pirate_session=session-1; __Host-pirate_csrf=csrf-1", authorization: "Bearer must-not-forward" },
    }), "https://api-next.test", fetchImpl);
    expect(result?.state).toMatchObject({ kind: "success", access: { "community.moderation.manage": true, "community.names.manage": true } });
    expect(requests.length).toBe(6);
    for (const [index, request] of requests.entries()) {
      expect(new URL(request.url).origin).toBe("https://api-next.test");
      expect(request.method).toBe("GET");
      expect(request.headers.get("authorization")).toBeNull();
      expect(request.headers.get("cookie")).toBe(index < 2 ? null : "__Host-pirate_session=session-1; __Host-pirate_csrf=csrf-1");
    }
    expect(JSON.stringify(result)).not.toContain("session-1");
    expect(ownerSettingsResponseStatus(result!.state)).toBe(200);
  });

  test("signed-out requests become denied rather than a transport failure", async () => {
    const { fetchImpl } = fixture(401);
    const result = await resolveOwnerSettingsPreflight(new Request("https://web.test/c/midnight/settings/names"), "https://api-next.test", fetchImpl);
    expect(result?.state).toEqual({ kind: "denied" });
    expect(ownerSettingsResponseStatus(result!.state)).toBe(404);
  });

  test("failed private probes retain retryable sections without granting access", async () => {
    const { fetchImpl } = fixture(503);
    const result = await resolveOwnerSettingsPreflight(new Request("https://web.test/c/midnight/settings/moderation_queue"), "https://api-next.test", fetchImpl);
    expect(result?.state).toMatchObject({ kind: "success", access: {}, unavailableSections: ["moderation_queue", "content_policy", "namespace", "names"] });
  });

  test("does not run on unrelated routes or send invalid paths upstream", async () => {
    const { requests, fetchImpl } = fixture();
    expect(await resolveOwnerSettingsPreflight(new Request("https://web.test/communities/new"), "https://api-next.test", fetchImpl)).toBeUndefined();
    expect((await resolveOwnerSettingsPreflight(new Request("https://web.test/c/bad%2Fpath/settings/names"), "https://api-next.test", fetchImpl))?.state).toEqual({ kind: "invalid" });
    expect(requests).toHaveLength(0);
  });
});
