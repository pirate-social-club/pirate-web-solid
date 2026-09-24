import type { Page, Request, Response, TestInfo } from "playwright/test";
import { completePrivyEmail, expect } from "./auth.ts";
import { readonlyApi } from "./api.ts";
import { isCreationCall } from "./creation-diagnostics.ts";

export type CommunityAcceptanceObservation = Readonly<{ readonly communityId: string }>;

// Adapted from the preserved community-creation foundation at 9dfb77ac.
// No API seeding: create the persona and community through the product UI.
export async function createCommunity(page: Page, marker: string): Promise<string> {
  await page.goto("/communities/new");
  await expect(page.locator("[data-creation-state='ready']")).toBeVisible();
  // Two pages since the 2026-09-20 amendment: details, then the owner profile.
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(marker);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("button", { name: "Create", exact: true })).toBeVisible();
  const publicName = page.getByRole("textbox", { name: "Your name", exact: true });
  if (await publicName.isVisible()) await publicName.fill("Community test creator");
  const [created] = await Promise.all([
    page.waitForResponse(response => response.request().method() === "POST"
      && /^\/(?:api\/)?community-creation-intents$/u.test(new URL(response.url()).pathname),
    { timeout: 60_000 }),
    page.getByRole("button", { name: "Create", exact: true }).click(),
  ]);
  if (!created.ok()) throw new Error(`Community creation returned HTTP ${created.status()}; inspect sanitized network events.`);

  const confirmation = page.getByRole("button", { name: "Continue with email" });
  let failed = false;
  await expect.poll(async () => {
    if (new URL(page.url()).pathname.startsWith("/c/")) return "created";
    if (await confirmation.isVisible()) return "confirm-profile";
    const alert = page.getByRole("alert").first();
    if (await alert.isVisible() && (await alert.innerText()).trim()) {
      failed = true;
      return "rejected";
    }
    return "pending";
  }, { timeout: 60_000, message: "Community creation must finish or request profile confirmation" }).not.toBe("pending");
  if (failed) throw new Error("Community creation was rejected by the product; inspect sanitized network events.");
  if (await confirmation.isVisible()) {
    await completePrivyEmail(page);
  }
  await page.waitForURL(url => url.pathname.startsWith("/c/"), { timeout: 60_000 });
  await expect(page.locator("[data-community-state='success']")).toBeVisible();
  await expect(page.getByRole("heading", { name: marker, exact: true })).toBeVisible();
  return new URL(page.url()).pathname;
}

/**
 * The lasting M1 flow owns the complete community-creation contract. Keep
 * these checks beside the UI helper so the standalone and folded specs cannot
 * silently diverge.
 */
export async function createCommunityAndVerifyAcceptance(
  page: Page,
  marker: string,
  testInfo: TestInfo,
  onObservation?: (observation: CommunityAcceptanceObservation) => void,
): Promise<string> {
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
    expect(starts).toHaveLength(1);
    expect(starts[0]!.status()).toBe(201);
    const { intent_id: intentId } = await starts[0]!.json() as { readonly intent_id?: unknown };
    if (typeof intentId !== "string" || intentId.length === 0) {
      throw new Error("Community creation must return a non-empty intent identifier");
    }
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
    onObservation?.({ communityId: resource.community_id });
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
      const preview = await api.communityPreview(resource.community_id);
      expect(preview.viewer_membership_status).toBe("member");
      expect(preview.viewer_following).toBe(true);
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
    expect(starts).toHaveLength(1);
    expect(mutations).toBe(completedMutations);
    return path;
  } finally {
    page.off("request", onRequest);
    page.off("response", onResponse);
  }
}
