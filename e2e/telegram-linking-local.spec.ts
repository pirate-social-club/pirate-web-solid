import { expect, test, type Route } from "playwright/test";

const base = process.env.E2E_BASE_URL ?? "";
const loopback = (() => { try { return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname); } catch { return false; } })();
const id = "a".repeat(43), state = "b".repeat(43);
const user = {
  id: "local-account", object: "user", verification_state: "unverified", created: 1788495833,
  verification_capabilities: Object.fromEntries(["unique_human", "age_over_18", "minimum_age", "nationality", "gender", "wallet_score"].map(key => [key, { state: "unverified" }])),
};
const persona = {
  persona_id: "persona-local-learner", object: "persona", status: "active",
  profile: { persona_id: "persona-local-learner", object: "persona_profile", revision: 1, display_name: "Learner persona", avatar_ref: null, cover_ref: null, bio: null, preferred_locale: null, primary_public_handle: null },
  wallet_set: { evm: null }, community_binding: { community_id: "music", binding_source: "first_membership" },
  created_at: "2026-09-07T00:00:00Z", retired_at: null,
};
const transaction = {
  id, state: "verified", expires_at: "2026-10-04T12:00:00Z", community_id: "music", community_name: "Music",
  bot_id: "123", bot_username: "community_bot", post_id: "song", telegram_user_id: "456",
  confirmation_display: { name: "Learner", username: "learner_fixture" },
};

// Only local built-Worker fixtures: this is neither Telegram OAuth acceptance
// nor evidence from a real phone, and cannot call staging or a login provider.
test.describe("Telegram linking built Worker", { tag: "@local-fixture" }, () => {
  test.skip(!loopback, "Requires a prepared loopback Worker; never run against staging.");
  for (const width of [1280, 375]) {
    test(`hydrates a private callback and explicitly confirms at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.context().addInitScript(() => {
        document.cookie = "__Host-pirate_csrf=local-fixture-csrf; Secure; SameSite=Lax; Path=/";
      });
      let confirmations = 0, verifications = 0;
      const respond = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      await page.route("**/*", async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== new URL(base).origin) return route.abort("blockedbyclient");
        if (!url.pathname.startsWith("/api/")) return route.continue();
        if (url.pathname === "/api/users/me") return respond(route, user);
        if (url.pathname === "/api/personas") return respond(route, { personas: [persona] });
        if (url.pathname === "/api/telegram/link/callback/verify") {
          verifications++;
          expect(request.postDataJSON()).toEqual({ code: "private-fixture-code", state });
          expect(request.headers()["x-csrf-token"]).toBe("local-fixture-csrf");
          return respond(route, transaction);
        }
        if (url.pathname === `/api/telegram/link/transactions/${id}/confirm`) {
          confirmations++;
          expect(request.postDataJSON()).toEqual({ persona_id: persona.persona_id });
          expect(request.headers()["x-csrf-token"]).toBe("local-fixture-csrf");
          return respond(route, { community_id: "music", bot_id: "123", persona_id: persona.persona_id, revision: 1, telegram_user_id: "456" });
        }
        return route.fulfill({ status: 404, contentType: "application/json", body: '{"error":{"code":"not_found","message":"Local fixture has no such operation"}}' });
      });
      const response = await page.goto(`${base}/telegram/link/callback?code=private-fixture-code&state=${state}`);
      expect(response?.headers()["cache-control"]).toContain("no-store");
      expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
      const html = await response!.text();
      expect(html).not.toContain("private-fixture-code"); expect(html).not.toContain(state);
      await expect(page.locator("#app-root")).toHaveAttribute("data-hydrated", "true");
      await expect(page.getByText(/@learner_fixture/)).toBeVisible();
      expect(verifications).toBe(1); expect(confirmations).toBe(0);
      await expect(page.getByRole("radio")).not.toBeChecked();
      expect(page.url()).toBe(`${base}/telegram/link/callback?transaction_id=${id}`);
      await page.getByRole("radio", { name: "Learner persona" }).check();
      await page.getByRole("button", { name: "Link this Telegram and persona" }).click();
      await expect(page.getByRole("status")).toHaveText("Linked to Learner persona.");
      expect(confirmations).toBe(1);
      await expect(page.getByText(/@learner_fixture/)).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Return to your community bot" })).toHaveAttribute("href", "https://t.me/community_bot");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
    });
  }
});
