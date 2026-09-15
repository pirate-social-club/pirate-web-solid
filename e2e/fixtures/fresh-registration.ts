import {
  expect,
  type Browser,
  type Page,
  type Request,
  type Response,
} from "playwright/test";

import { completePrivyEmail } from "./auth.ts";
import { e2eBaseURL } from "./environment.ts";

type RegistrationObservation = Readonly<{
  readonly exchangeStatuses: readonly number[];
  readonly registerStatuses: readonly number[];
  readonly registrationAttestationValid: boolean;
}>;

function isPath(response: Response, suffix: string): boolean {
  return new URL(response.url()).pathname.endsWith(suffix);
}

function attestationIsValid(postData: string | null): boolean {
  try {
    const body: unknown = JSON.parse(postData ?? "");
    if (body === null || typeof body !== "object" || Array.isArray(body)) return false;
    const candidate = (body as { readonly minimum_age_attestation?: unknown }).minimum_age_attestation;
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const value = candidate as Record<string, unknown>;
    return value.version === "minimum-age-attestation-v1"
      && value.minimum_age === 16
      && value.affirmed === true;
  } catch {
    return false;
  }
}

export function observeRegistration(page: Page): {
  readonly observation: () => RegistrationObservation;
  readonly stop: () => void;
} {
  const exchangeStatuses: number[] = [];
  const registerStatuses: number[] = [];
  let registrationAttestationValid = false;
  // The explicit event callback type keeps request bodies in memory only.
  const requestListener = (request: Request) => {
    if (request.method() === "POST" && request.url().includes("/auth/register")) {
      registrationAttestationValid = attestationIsValid(request.postData());
    }
  };
  const responseListener = (response: Response) => {
    if (isPath(response, "/auth/session/exchange")) exchangeStatuses.push(response.status());
    if (isPath(response, "/auth/register")) registerStatuses.push(response.status());
  };
  // Keep the callback assignment separate from the observation API so callers
  // cannot accidentally retain a request or response object in evidence.
  page.on("request", requestListener);
  page.on("response", responseListener);
  return {
    observation: () => ({
      exchangeStatuses: [...exchangeStatuses],
      registerStatuses: [...registerStatuses],
      registrationAttestationValid,
    }),
    stop: () => {
      page.off("request", requestListener);
      page.off("response", responseListener);
    },
  };
}

async function assertAuthenticated(page: Page): Promise<void> {
  await page.waitForURL(url => url.pathname === "/", { timeout: 60_000 });
  await expect(page.locator("[data-home-session='authenticated']")).toBeVisible();
  await expect(page.locator("[data-media-shell][data-shell-auth='authenticated']")).toBeVisible();
}

export async function registerFreshAccount(browser: Browser): Promise<RegistrationObservation> {
  const context = await browser.newContext({ baseURL: new URL(e2eBaseURL()).origin });
  const page = await context.newPage();
  try {
    return await registerFreshAccountOnPage(page);
  } finally {
    await context.close();
  }
}

export async function registerFreshAccountOnPage(page: Page): Promise<RegistrationObservation> {
  const watcher = observeRegistration(page);
  try {
    await page.goto("/auth/sign-in");
    await expect(page.locator("[data-route-path='/auth/sign-in']")).toBeVisible();
    await expect(page.getByText(/at least 16 years old/u)).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms", exact: true })).toHaveAttribute("href", "/terms");
    await expect(page.getByRole("link", { name: "Privacy Policy", exact: true })).toHaveAttribute("href", "/privacy");
    await completePrivyEmail(page);
    await assertAuthenticated(page);
    await page.reload();
    await expect(page.locator("[data-home-session='authenticated']")).toBeVisible();
    return watcher.observation();
  } finally {
    watcher.stop();
  }
}

export async function signInExistingAccount(browser: Browser): Promise<RegistrationObservation> {
  const context = await browser.newContext({ baseURL: new URL(e2eBaseURL()).origin });
  const page = await context.newPage();
  try {
    return await signInExistingAccountOnPage(page);
  } finally {
    await context.close();
  }
}

export async function signInExistingAccountOnPage(page: Page): Promise<RegistrationObservation> {
  const watcher = observeRegistration(page);
  try {
    await page.goto("/auth/sign-in");
    await expect(page.locator("[data-route-path='/auth/sign-in']")).toBeVisible();
    await completePrivyEmail(page);
    await assertAuthenticated(page);
    return watcher.observation();
  } finally {
    watcher.stop();
  }
}
