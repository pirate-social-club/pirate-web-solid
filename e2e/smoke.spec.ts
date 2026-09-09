import { expect, test, type ConsoleMessage, type Page, type Response } from "playwright/test";

type PageFailures = Readonly<{
  messages: string[];
  rejected: Array<{ status: number; method: string; path: string }>;
  stop: () => void;
}>;

/**
 * An anonymous visitor's session resolution asks the API who they are, and the
 * API answers 401 because they are nobody yet. The browser logs every rejected
 * fetch as a resource error, so that one line is the expected answer to a
 * necessary question rather than a fault. It is recognised by request, so any
 * other rejected request still fails the route.
 */
function isAnonymousSessionProbe(entry: { status: number; method: string; path: string }): boolean {
  return entry.status === 401 && entry.method === "GET" && entry.path === "/api/users/me";
}

const resourceErrorText = /^Failed to load resource: the server responded with a status of 401/u;

function collectPageFailures(page: Page): PageFailures {
  const messages: string[] = [];
  const rejected: Array<{ status: number; method: string; path: string }> = [];
  const onResponse = (response: Response) => {
    if (response.status() < 400) return;
    rejected.push({
      status: response.status(),
      method: response.request().method(),
      path: new URL(response.url()).pathname,
    });
  };
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === "error") {
      messages.push(`console: ${message.text()}`);
    }
  };
  const onPageError = (error: Error) => messages.push(`pageerror: ${error.message}`);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);
  return {
    messages,
    rejected,
    stop: () => {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("response", onResponse);
    },
  };
}

test.describe("staging route smoke", { tag: "@staging-readonly" }, () => {
  const routes = [
    ["/", "[data-route-path='/']"],
    ["/auth/sign-in", "[data-route-path='/auth/sign-in']"],
    ["/verify/very", "[data-route-path='/verify/very']"],
    ["/verify/zkpassport", "[data-route-path='/verify/zkpassport']"],
  ] as const;

  for (const [path, selector] of routes) {
    test(`${path} renders without browser errors`, async ({ page }) => {
      const failures = collectPageFailures(page);
      try {
        const response = await page.goto(path, { waitUntil: "domcontentloaded" });
        expect(response?.status()).toBe(200);
        await expect(page.locator(selector)).toBeVisible();
        if (path === "/auth/sign-in") {
          await expect(page.getByRole("button", { name: "Continue with email" })).toBeVisible();
        }

        // Wait for the page to stop talking before reading what went wrong.
        // Asserting at first paint let a late failure arrive after the check
        // and pass unnoticed, which is how the session probe's 401 went unseen.
        await page.waitForLoadState("networkidle");

        // Every rejected request fails the route unless it is the anonymous
        // session probe, which is asserted rather than merely tolerated.
        const unexpected = failures.rejected.filter(entry => !isAnonymousSessionProbe(entry));
        expect(unexpected, `unexpected rejected requests on ${path}`).toEqual([]);
        // The console line carries no request, so it is matched on its own
        // terms. Pairing it with a captured response only made the check
        // depend on which of the two the browser reported first. Any 401 from
        // somewhere other than the session probe is already an unexpected
        // rejected request above.
        const consoleFailures = failures.messages.filter(message =>
          !resourceErrorText.test(message.replace(/^console: /u, "")));
        expect(consoleFailures, `unexpected browser errors on ${path}`).toEqual([]);
      } finally {
        failures.stop();
      }
    });
  }

  test("homepage sign-in control opens the global ceremony", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
    await expect(page.getByRole("dialog", { name: "Join Pirate" })).toBeVisible();
  });

  test("route CSPs retain the verification origins", async ({ request }) => {
    const very = await request.get("/verify/very");
    expect(very.status()).toBe(200);
    const veryCsp = very.headers()["content-security-policy"] ?? "";
    expect(veryCsp).toContain("frame-src https://auth.privy.io");
    expect(veryCsp).toContain("https://bridge.very.org");
    expect(veryCsp).toContain("https://verify.very.org");
    expect(veryCsp).toContain("https://assets.very.org");

    const signIn = await request.get("/auth/sign-in");
    expect(signIn.status()).toBe(200);
    const signInCsp = signIn.headers()["content-security-policy"] ?? "";
    expect(signInCsp).toContain("frame-src https://auth.privy.io");
    expect(signInCsp).toContain("connect-src 'self' https://auth.privy.io");
  });
});
