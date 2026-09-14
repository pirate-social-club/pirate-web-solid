import { randomUUID } from "node:crypto";
import { expect, test, type Page, type Route } from "playwright/test";

// These scenarios drive the real built application with all api-next traffic
// intercepted, so they need a prepared loopback origin and never run against
// staging. Serve the built Worker on 127.0.0.1:4186 and set E2E_BASE_URL.
const base = process.env.E2E_BASE_URL?.trim().replace(/\/$/u, "") ?? "";

function loopbackOrigin(value: string): boolean {
  try {
    return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

const policy = {
  accessPaths: [{ id: "default", operator: "and", requirements: [{ requirement: "human-verification" }] }],
  version: 1,
};

const owner = {
  avatar_ref: null,
  display_name: "Community test creator",
  object: "persona",
  persona_id: "persona-local-owner",
  primary_public_handle: null,
};

// One active persona already bound to another community, so the form offers
// only the create-new path.
const boundPersona = {
  persona_id: "persona-local-owner",
  object: "persona",
  status: "active",
  profile: {
    persona_id: "persona-local-owner",
    object: "persona_profile",
    revision: 1,
    display_name: "Community test creator",
    avatar_ref: null,
    cover_ref: null,
    bio: null,
    preferred_locale: null,
    primary_public_handle: null,
  },
  wallet_set: { evm: null },
  community_binding: { community_id: randomUUID(), binding_source: "first_membership" },
  created_at: "2026-09-07T00:00:00Z",
  retired_at: null,
};

const userMe = {
  id: "local-account",
  object: "user",
  verification_state: "unverified",
  verification_capabilities: Object.fromEntries(
    ["unique_human", "age_over_18", "minimum_age", "nationality", "gender", "wallet_score"]
      .map(key => [key, { state: "unverified" }]),
  ),
  created: 1788495833,
};

async function stableForm(page: Page) {
  return page.locator("[data-create-community]").evaluate(form => {
    const rect = (element: Element) => {
      const value = element.getBoundingClientRect();
      return { x: value.x + window.scrollX, y: value.y + window.scrollY, width: value.width, height: value.height };
    };
    const submit = form.querySelector("button[type=submit]");
    return {
      form: rect(form),
      fields: [...form.querySelectorAll("input, textarea")].map(field => ({
        rect: rect(field),
        value: (field as HTMLInputElement | HTMLTextAreaElement).value,
      })),
      labels: [...form.querySelectorAll("label")].map(label => label.textContent),
      button: submit === null ? null : rect(submit),
      buttonText: submit?.textContent?.trim() ?? null,
    };
  });
}

test.describe("community creation local fixture", { tag: "@local-fixture" }, () => {
  test.skip(!loopbackOrigin(base), "Set E2E_BASE_URL to a prepared loopback origin that serves the built Worker.");

  test("keeps a rejected create retryable and resumes a saved intent without duplicate writes", async ({ page }) => {
    test.setTimeout(180_000);
    const communityId = randomUUID();
    const communityPath = `/c/${communityId}`;
    const csrfToken = `local-csrf-${randomUUID()}`;
    const marker = `E2E local community ${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    let commits = 0;
    let activated = false;
    let committed = false;
    let creationCalls = 0;
    const createKeys: string[] = [];
    let rejectFirstCreate = true;
    let markFirstCreateStarted!: () => void;
    let releaseFirstCreate!: () => void;
    const firstCreateStarted = new Promise<void>(resolve => { markFirstCreateStarted = resolve; });
    const firstCreateHeld = new Promise<void>(resolve => { releaseFirstCreate = resolve; });

    const intent = () => ({
      canonical_policy_hash: "policy-hash",
      canonical_policy_revision: 1,
      committed_resource: committed
        ? {
            authority_version: "optional_route_v2",
            canonical_route: null,
            community_id: communityId,
            href: communityPath,
            persona_role_presentation: { persona: owner, role: "owner" },
          }
        : null,
      creation_contract_version: "optional_route_v2",
      draft: {
        description: "Automated local creation fixture",
        name: marker,
        persona: { kind: "create_new" },
        public_name: "Community test creator",
        policy,
      },
      expires_at: expiresAt,
      intent_id: "local-creation-1",
      next_action: committed
        ? { kind: "none", reason: "committed" }
        : !commits || activated
          ? { kind: "commit" }
          : { kind: "activate_profile", persona_id: "persona-local-owner" },
      persona_role_presentation: activated ? { persona: owner, role: "owner" } : null,
      requirements: {},
      revision: committed ? 3 : commits ? 2 : 1,
      status: committed ? "committed" : "commit_ready",
    });

    const respond = (route: Route, body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    // Loopback is a trustworthy origin, so the page can own its CSRF cookie
    // without an https scheme; the double-submit header is asserted below.
    await page.context().addInitScript(token => {
      document.cookie = `__Host-pirate_csrf=${token}; Secure; SameSite=Lax; Path=/`;
    }, csrfToken);
    await page.route(`**${communityPath}`, route =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<main>Community fixture</main>" }));
    await page.route("**/api/**", async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/api/users/me") return respond(route, userMe);
      if (path === "/api/personas") return respond(route, { personas: [boundPersona] });
      if (path === "/api/community-creation-intents" && request.method() === "POST") {
        creationCalls += 1;
        expect(request.headers()["x-csrf-token"]).toBe(csrfToken);
        const body = request.postDataJSON() as {
          idempotency_key?: unknown;
          draft?: { persona?: unknown; public_name?: unknown };
        };
        createKeys.push(typeof body.idempotency_key === "string" ? body.idempotency_key : "");
        expect(body.draft?.persona).toEqual({ kind: "create_new" });
        expect(body.draft?.public_name).toBe("Community test creator");
        if (rejectFirstCreate) {
          rejectFirstCreate = false;
          markFirstCreateStarted();
          await firstCreateHeld;
          return respond(route, { error: { code: "provider_unavailable", message: "Unavailable", retryable: true } }, 503);
        }
        return respond(route, intent());
      }
      if (path === "/api/community-creation-intents/local-creation-1/commit") {
        commits += 1;
        if (commits > 1) {
          activated = true;
          committed = true;
        }
        return respond(route, intent());
      }
      if (path === "/api/community-creation-intents/local-creation-1") return respond(route, intent());
      return respond(route, { error: { code: "provider_unavailable", message: "Local fixture has no provider", retryable: true } }, 503);
    });

    const response = await page.goto(`${base}/communities/new`);
    expect(await response?.text()).toContain("Public name");
    await expect(page.locator("[data-create-community]")).toBeVisible();
    await expect(page.locator("[data-creation-state='ready']")).toBeVisible();
    await expect(page.getByRole("button", { name: "Use an existing profile", exact: true })).toHaveCount(0);

    await page.getByRole("textbox", { name: "Name", exact: true }).fill(marker);
    await page.getByRole("textbox", { name: "Public name", exact: true }).fill("Community test creator");
    await page.getByRole("textbox", { name: "Public name", exact: true }).blur();
    const before = await stableForm(page);

    const create = page.getByRole("button", { name: "Create", exact: true });
    await create.click();
    await page.waitForFunction(() =>
      document.querySelector("[data-create-community] fieldset")?.hasAttribute("disabled") === true);
    await firstCreateStarted;
    expect(await stableForm(page)).toEqual(before);
    releaseFirstCreate();
    await expect(page.getByRole("alert").filter({ hasText: "Couldn't create your community" })).toBeVisible();
    expect(await stableForm(page)).toEqual(before);

    await create.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(commits).toBe(1);
    expect(committed).toBe(false);
    expect(page.url()).toContain("intent_id=local-creation-1");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(commits).toBe(1);
    expect(await stableForm(page)).toEqual(before);

    // Another tab completes profile activation before this tab resumes.
    activated = true;
    await page.reload();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForURL(`**${communityPath}`);
    expect(commits).toBe(2);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goto(`${base}/communities/new?intent_id=local-creation-1`);
    await page.waitForURL(`**${communityPath}`);
    expect(commits).toBe(2);
    // One rejected attempt plus one retry that replays the same logical
    // creation key; the reload and the committed reopen create nothing.
    expect(creationCalls).toBe(2);
    expect(createKeys[1]).toBe(createKeys[0]);
    expect(new Set(createKeys).size).toBe(1);
  });
});
