import { randomUUID } from "node:crypto";
import type { Request, Response } from "playwright/test";
import { readonlyApi } from "./fixtures/api.ts";
import { expect, test } from "./fixtures/auth.ts";
import { createCommunity } from "./fixtures/create-community.ts";
import { isCreationCall } from "./fixtures/creation-diagnostics.ts";
import { requireMutationEnvironment } from "./fixtures/environment.ts";

test.describe("required community creation", { tag: "@community-creation" }, () => {
  // Also fail closed if this spec is invoked through the general configuration.
  test.beforeAll(() => requireMutationEnvironment());

  test("creates once and retains owner identity when reloading and reopening the intent", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const marker = `E2E community ${randomUUID()}`;
    const starts: Response[] = [];
    let mutations = 0;
    const onRequest = (request: Request) => {
      if (isCreationCall(request.url()) && ["POST", "PATCH"].includes(request.method())) mutations++;
    };
    const onResponse = (response: Response) => {
      if (response.request().method() === "POST"
        && /^\/api\/community-creation-intents$/u.test(new URL(response.url()).pathname)) starts.push(response);
    };
    page.on("request", onRequest);
    page.on("response", onResponse);
    try {
      const path = await createCommunity(page, marker);
      testInfo.annotations.push({ type: "persistent-content", description: `Created ${path}; no automatic deletion contract.` });
      expect(starts.length).toBe(1);
      const { intent_id: intentId } = await starts[0]!.json();
      expect(typeof intentId).toBe("string");
      expect(intentId.length).toBeGreaterThan(0);
      const api = readonlyApi(page);
      const committed = await api.creationIntent(intentId);
      expect(committed.status).toBe("committed");
      expect(committed.next_action).toEqual({ kind: "none", reason: "committed" });
      const resource = committed.committed_resource;
      expect(resource).not.toBeNull();
      if (!resource) throw new Error("Committed creation must expose its resource");
      if (!("authority_version" in resource) || resource.authority_version !== "optional_route_v2") {
        throw new Error("Creation acceptance requires the current optional-route contract");
      }
      expect(resource.href).toBe(path);
      expect(resource.persona_role_presentation.role).toBe("owner");
      const personaId = resource.persona_role_presentation.persona.persona_id;
      const checkOwner = async () => {
        const capabilities = await api.ownerCapabilities(resource.community_id);
        expect(capabilities.role).toBe("owner");
        expect(capabilities.capabilities).toContain("moderation.view");
        const persona = (await api.personas()).personas.find(item => item.persona_id === personaId);
        expect(persona?.status).toBe("active");
        expect(persona?.community_binding?.community_id).toBe(resource.community_id);
        const membership = await api.membership(resource.community_id);
        expect(membership?.membership_status).toBe("member");
        expect(membership?.can_post).toBe(true);
      };
      await checkOwner();
      const completedMutations = mutations;
      await page.reload();
      await expect(page.locator("[data-community-state='success']")).toBeVisible();
      await expect(page.getByRole("heading", { name: marker, exact: true })).toBeVisible();
      await checkOwner();
      await page.getByRole("button", { name: "More community options", exact: true }).click();
      await page.getByRole("menuitem", { name: "Manage community", exact: true }).click();
      await page.waitForURL(url => url.pathname === `${path}/settings/moderation_queue`);
      await expect(page.locator("[data-community-management-shell]")).toBeVisible();

      await page.goto(`/communities/new?intent_id=${encodeURIComponent(intentId)}`);
      await page.waitForURL(url => url.pathname === path);
      await expect(page.getByRole("heading", { name: marker, exact: true })).toBeVisible();
      const resumed = await api.creationIntent(intentId);
      expect(resumed.committed_resource).toEqual(resource);
      expect(resumed.revision).toBe(committed.revision);
      expect(starts.length).toBe(1);
      expect(mutations).toBe(completedMutations);
    } finally {
      page.off("request", onRequest);
      page.off("response", onResponse);
    }
  });
});
