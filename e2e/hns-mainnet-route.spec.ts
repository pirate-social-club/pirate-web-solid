import { completePrivyEmail, expect, test } from "./fixtures/auth.ts";
import { e2eAuthCredentials, e2eBaseURL } from "./fixtures/environment.ts";

type HnsFixture = Readonly<{
  root: string;
  communityId: string;
  sessionId: string;
  communityName: string;
}>;

function stagingFixture(): HnsFixture {
  if (new URL(e2eBaseURL()).origin !== "https://web-next-staging.pirate.sc") {
    throw new Error("The HNS mainnet route smoke runs only against Pirate staging.");
  }
  e2eAuthCredentials();
  const root = process.env.E2E_HNS_ROOT?.trim() ?? "";
  const communityId = process.env.E2E_HNS_COMMUNITY_ID?.trim() ?? "";
  const sessionId = process.env.E2E_HNS_SESSION_ID?.trim() ?? "";
  const communityName = process.env.E2E_HNS_COMMUNITY_NAME?.trim() ?? "";
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(root)
      || !/^community_[a-z0-9-]+$/u.test(communityId)
      || !/^hns-root-import_[a-z0-9-]+$/u.test(sessionId)
      || communityName.length === 0 || communityName.length > 160) {
    throw new Error("A staging HNS root, community ID, import session ID, and community name are required.");
  }
  return { root, communityId, sessionId, communityName };
}

test.describe("attached staging Handshake route", { tag: "@hns-mainnet-readonly" }, () => {
  test.beforeAll(() => { stagingFixture(); });

  test("owner sees the verified import and the route survives anonymous reload and fresh sign-in", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const fixture = stagingFixture();
    const route = `/c/${fixture.root}`;
    await page.goto(`/c/${fixture.communityId}/settings/namespace?hns_import_session=${fixture.sessionId}`);
    await expect(page.locator("[data-next-action='verified']")).toBeVisible({ timeout: 30_000 });

    const anonymous = await browser.newContext({ baseURL: e2eBaseURL() });
    try {
      const visitor = await anonymous.newPage();
      const first = await visitor.goto(route);
      expect(first?.status()).toBe(200);
      await expect(visitor.locator("[data-community-state='success']")).toBeVisible();
      await expect(visitor.getByRole("heading", { name: fixture.communityName, exact: true }).first()).toBeVisible();
      const reload = await visitor.reload();
      expect(reload?.status()).toBe(200);
      await expect(visitor.locator("[data-community-state='success']")).toBeVisible();
    } finally {
      await anonymous.close();
    }

    const fresh = await browser.newContext({ baseURL: e2eBaseURL() });
    try {
      const visitor = await fresh.newPage();
      await visitor.goto("/auth/sign-in");
      await completePrivyEmail(visitor);
      await visitor.waitForURL(url => url.pathname === "/", { timeout: 60_000 });
      const signedIn = await visitor.goto(route);
      expect(signedIn?.status()).toBe(200);
      await expect(visitor.locator("[data-community-state='success']")).toBeVisible();
      await expect(visitor.getByRole("heading", { name: fixture.communityName, exact: true }).first()).toBeVisible();
    } finally {
      await fresh.close();
    }
    console.log(JSON.stringify({ event: "hns-mainnet-staging-route", root: fixture.root,
      communityId: fixture.communityId, sessionId: fixture.sessionId,
      ownerVerified: true, anonymous: 200, reload: 200, freshSignIn: 200 }));
  });
});
