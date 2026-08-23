import {
  expect,
  test as base,
  type BrowserContext,
} from "playwright/test";

const DEFAULT_BASE_URL = "https://web-next-staging.pirate.sc";

type AuthStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
type AuthWorkerFixtures = Readonly<{
  authenticatedStorageState: AuthStorageState;
}>;

function baseURL(): string {
  return process.env.E2E_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

export function hasE2eAuthCredentials(): boolean {
  return Boolean(process.env.E2E_PRIVY_EMAIL?.trim() && process.env.E2E_PRIVY_OTP?.trim());
}

function credentials(): Readonly<{ email: string; otp: string }> {
  const email = process.env.E2E_PRIVY_EMAIL?.trim();
  const otp = process.env.E2E_PRIVY_OTP?.trim();
  if (!email || !otp) {
    throw new Error("E2E_PRIVY_EMAIL and E2E_PRIVY_OTP are required for authenticated E2E tests");
  }
  return { email, otp };
}

function cookieMatchesHost(domain: string, hostname: string): boolean {
  const normalized = domain.startsWith(".") ? domain.slice(1) : domain;
  return hostname === normalized || hostname.endsWith(`.${normalized}`);
}

export const test = base.extend<Record<never, never>, AuthWorkerFixtures>({
  authenticatedStorageState: [async ({ browser }, use) => {
    const account = credentials();
    const target = new URL(baseURL());
    const context = await browser.newContext({ baseURL: target.origin });
    const page = await context.newPage();
    try {
      await page.goto("/auth/sign-in");
      await expect(page.locator("[data-route-path='/auth/sign-in']")).toBeVisible();
      await page.getByRole("button", { name: "Continue with email" }).click();
      await page.getByRole("textbox", { name: "Email" }).fill(account.email);
      await page.getByRole("button", { name: "Send login code" }).click();
      await page.getByRole("textbox", { name: "Login code" }).fill(account.otp);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();

      const register = page.getByRole("button", { name: "Create Pirate account" });
      await expect.poll(async () => {
        if (new URL(page.url()).pathname === "/") return "authenticated";
        if (await register.isVisible()) return "register";
        return "pending";
      }, { timeout: 30_000 }).not.toBe("pending");
      if (await register.isVisible()) await register.click();

      await page.waitForURL(url => url.pathname === "/");
      await expect(page.locator("[data-home-session='authenticated']")).toBeVisible();
      await expect(page.locator("[data-media-shell][data-shell-auth='authenticated']")).toBeVisible();

      const raw = await context.storageState();
      const state: AuthStorageState = {
        cookies: raw.cookies.filter(cookie => cookieMatchesHost(cookie.domain, target.hostname)),
        origins: raw.origins.filter(origin => origin.origin === target.origin),
      };
      await use(state);
    } finally {
      await context.close();
    }
  }, { scope: "worker" }],
  storageState: async ({ authenticatedStorageState }, use) => {
    await use(authenticatedStorageState);
  },
});

export { expect };
