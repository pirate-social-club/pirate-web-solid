import type { Page } from "playwright/test";
import { completePrivyEmail, expect } from "./auth.ts";

// Adapted from the preserved community-creation foundation at 9dfb77ac.
// No API seeding: create the persona and community through the product UI.
export async function createCommunity(page: Page, marker: string): Promise<string> {
  await page.goto("/communities/new");
  await expect(page.locator("[data-creation-state='ready']")).toBeVisible();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(marker);
  await page.getByRole("textbox", { name: "Description", exact: true }).fill("Automated song publication acceptance");
  const publicName = page.getByRole("textbox", { name: "Public name", exact: true });
  if (await publicName.isVisible()) await publicName.fill("Song test creator");
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
    if (await page.getByRole("alert").first().isVisible()) { failed = true; return "rejected"; }
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
