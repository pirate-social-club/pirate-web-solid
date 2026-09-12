import { writeFile } from "node:fs/promises";
import {
  expect,
  test as base,
  type BrowserContext,
  type Page,
} from "playwright/test";
import { captureSanitizedNetworkDiagnostics } from "./diagnostics.ts";

const DEFAULT_BASE_URL = "https://web-next-staging.pirate.sc";

type AuthStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
type AuthTestFixtures = Readonly<{
  sanitizedDiagnostics: void;
}>;
type AuthWorkerFixtures = Readonly<{
  authenticatedStorageState: AuthStorageState;
}>;

function baseURL(): string {
  return process.env.E2E_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

export function hasE2eAuthCredentials(): boolean {
  return Boolean(readCredential("email") && readCredential("otp"));
}

function readCredential(kind: "email" | "otp"): string | undefined {
  const direct = kind === "email" ? process.env.E2E_PRIVY_EMAIL : process.env.E2E_PRIVY_OTP;
  const operator = kind === "email"
    ? process.env.MODERATION_E2E_OWNER_EMAIL
    : process.env.MODERATION_E2E_OWNER_OTP;
  return direct?.trim() || operator?.trim() || undefined;
}

export function e2eAuthCredentials(): Readonly<{ email: string; otp: string }> {
  const email = readCredential("email");
  const otp = readCredential("otp");
  if (!email || !otp) {
    throw new Error("E2E Privy credentials are required for authenticated E2E tests");
  }
  return { email, otp };
}

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
    const target = new URL(baseURL());
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
    await diagnostics.stop();
    if (testInfo.status !== testInfo.expectedStatus) {
      const path = testInfo.outputPath("sanitized-network-events.json");
      await writeFile(path, diagnostics.summary());
      await testInfo.attach("sanitized-network-events", {
        path,
        contentType: "application/json",
      });
    }
  }, { auto: true }],
  storageState: async ({ authenticatedStorageState }, use) => {
    await use(authenticatedStorageState);
  },
});

export { expect };
