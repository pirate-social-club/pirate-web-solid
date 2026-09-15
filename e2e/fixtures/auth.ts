import {
  expect,
  test as base,
  type BrowserContext,
  type Page,
} from "playwright/test";
import {
  captureSanitizedNetworkDiagnostics,
  persistSanitizedNetworkDiagnostics,
} from "./diagnostics.ts";
import { e2eAuthCredentials, e2eBaseURL } from "./environment.ts";
export { hasE2eAuthCredentials } from "./environment.ts";

type AuthStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
type AuthTestFixtures = Readonly<{
  sanitizedDiagnostics: void;
}>;
type AuthWorkerFixtures = Readonly<{
  authenticatedStorageState: AuthStorageState;
}>;

export async function completePrivyEmail(page: Page): Promise<void> {
  let stage = "email entry";
  try {
    const account = e2eAuthCredentials();
    await page.getByRole("textbox", { name: "Email", exact: true }).fill(account.email);
    stage = "request verification code";
    await page.getByRole("button", { name: "Continue with email", exact: true }).click();
    stage = "verification code entry";
    for (const [index, digit] of [...account.otp].entries()) {
      await page.getByRole("textbox", { name: `Verification code digit ${index + 1} of 6`, exact: true }).fill(digit);
    }
    stage = "verify and continue";
    await page.getByRole("button", { name: "Verify and continue", exact: true }).click();
  } catch {
    throw new Error(`Privy test sign-in failed during ${stage}; credential details withheld.`);
  }
}

function cookieMatchesHost(domain: string, hostname: string): boolean {
  const normalized = domain.startsWith(".") ? domain.slice(1) : domain;
  return hostname === normalized || hostname.endsWith(`.${normalized}`);
}

export const test = base.extend<AuthTestFixtures, AuthWorkerFixtures>({
  trace: "off",
  screenshot: "off",
  video: "off",
  authenticatedStorageState: [async ({ browser }, use) => {
    const target = new URL(e2eBaseURL());
    const context = await browser.newContext({ baseURL: target.origin });
    const page = await context.newPage();
    const diagnostics = captureSanitizedNetworkDiagnostics(page);
    let state: AuthStorageState | undefined;
    try {
      await page.goto("/auth/sign-in");
      await expect(page.locator("[data-route-path='/auth/sign-in']")).toBeVisible();
      await completePrivyEmail(page);

      await page.waitForURL(url => url.pathname === "/", { timeout: 60_000 });
      await expect(page.locator("[data-home-session='authenticated']")).toBeVisible();
      await expect(page.locator("[data-media-shell][data-shell-auth='authenticated']")).toBeVisible();

      const raw = await context.storageState();
      state = {
        cookies: raw.cookies.filter(cookie => cookieMatchesHost(cookie.domain, target.hostname)),
        origins: raw.origins.filter(origin => origin.origin === target.origin),
      };
    } catch (error) {
      await diagnostics.stop();
      const stage = error instanceof Error && error.message.startsWith("Privy test sign-in failed during ") ? error.message : "Privy session establishment failed.";
      throw new Error(`${stage}\nSanitized network events:\n${diagnostics.summary()}`);
    } finally {
      await diagnostics.stop();
      await context.close();
    }
    await use(state);
  }, { scope: "worker", timeout: 120_000 }],
  sanitizedDiagnostics: [async ({ page }, use, testInfo) => {
    const diagnostics = captureSanitizedNetworkDiagnostics(page);
    await use();
    if (testInfo.status !== testInfo.expectedStatus) {
      await persistSanitizedNetworkDiagnostics([diagnostics], testInfo);
    } else {
      await diagnostics.stop();
    }
  }, { auto: true }],
  storageState: async ({ authenticatedStorageState }, use) => {
    await use(authenticatedStorageState);
  },
});

export { expect };
