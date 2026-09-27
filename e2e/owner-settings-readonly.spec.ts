import type { GetUsersMeCommunityMembershipsResponse } from "@pirate/api-client";
import { expect, test } from "./fixtures/auth.ts";
import { e2eBaseURL } from "./fixtures/environment.ts";

test.describe("authenticated owner settings", { tag: "@hns-readonly" }, () => {
  test.beforeAll(() => {
    expect(new URL(e2eBaseURL()).origin, "Staging-only test credentials").toBe("https://web-next-staging.pirate.sc");
  });
  test("discovers an existing owner community and checks namespace access without writes", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const blockedWrites: string[] = [];
    await page.route("**/api/**", async route => {
      const request = route.request();
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        blockedWrites.push(`${request.method()} ${new URL(request.url()).pathname}`);
        await route.abort("blockedbyclient");
      } else await route.continue();
    });
    const memberships: GetUsersMeCommunityMembershipsResponse["items"][number][] = [];
    const seen = new Set<string>();
    let cursor: string | null = null;
    for (let index = 0; index < 100; index++) {
      const response = await page.request.get("/api/users/me/community-memberships", {
        params: { limit: "100", ...(cursor ? { cursor } : {}) },
      });
      expect(response.status(), "membership discovery").toBe(200);
      const body = await response.json() as GetUsersMeCommunityMembershipsResponse;
      memberships.push(...body.items);
      cursor = body.next_cursor;
      if (cursor === null) break;
      expect(seen.has(cursor), "repeated membership cursor").toBe(false);
      seen.add(cursor);
    }
    expect(cursor, "membership discovery must complete").toBeNull();
    let selected: typeof memberships[number] | undefined;
    const probes: Array<{ path: string; status: number }> = [];
    for (const membership of memberships) {
      const path = `/api/communities/${encodeURIComponent(membership.community_id)}/me/capabilities`;
      const response = await page.request.get(path);
      probes.push({ path, status: response.status() });
      if (response.status() === 404 || response.status() === 403) continue;
      expect(response.status(), "owner capability discovery").toBe(200);
      const body = await response.json() as { role?: string };
      if (body.role === "owner") { selected = membership; break; }
    }
    await testInfo.attach("owner-probe-statuses", { body: JSON.stringify(probes), contentType: "application/json" });
    expect(selected, "No eligible existing owner community; do not create a substitute automatically").toBeDefined();
    if (!selected) return;
    const prefix = `/api/communities/${encodeURIComponent(selected.community_id)}`;
    for (const suffix of ["handle-sales-management", "handle-sales-management/sale-namespaces", "handle-sales-management/offerings", "hns-txt-attachments"]) {
      const response = await page.request.get(`${prefix}/${suffix}`);
      probes.push({ path: `${prefix}/${suffix}`, status: response.status() });
    }
    await testInfo.attach("namespace-probe-statuses", { body: JSON.stringify(probes), contentType: "application/json" });
    const path = `/c/${encodeURIComponent(selected.community_id)}/settings/namespace`;
    const documents: Array<{ status: number | undefined; routeDenied: boolean; namespaceDenied: boolean }> = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = attempt === 0 ? await page.goto(path) : await page.reload();
      await page.waitForLoadState("networkidle");
      documents.push({
        status: response?.status(),
        routeDenied: await page.locator("[data-owner-settings-route-state='denied']").count() > 0,
        namespaceDenied: await page.locator("[data-owner-settings-denied]").count() > 0,
      });
    }
    console.log(JSON.stringify({ event: "hns-owner-readonly", probes, documents, blockedWrites }));
    for (const probe of probes.slice(-4)) expect.soft(probe.status, probe.path).toBe(200);
    for (const document of documents) expect.soft(document).toEqual({ status: 200, routeDenied: false, namespaceDenied: false });
    expect(blockedWrites, "read-only page must not attempt product writes").toEqual([]);
  });
});
