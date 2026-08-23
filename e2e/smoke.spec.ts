import { expect, test, type ConsoleMessage, type Page } from "playwright/test";

type PageFailures = Readonly<{
  messages: string[];
  stop: () => void;
}>;

function collectPageFailures(page: Page): PageFailures {
  const messages: string[] = [];
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === "error") {
      messages.push(`console: ${message.text()}`);
    }
  };
  const onPageError = (error: Error) => messages.push(`pageerror: ${error.message}`);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  return {
    messages,
    stop: () => {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
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
        expect(failures.messages).toEqual([]);
      } finally {
        failures.stop();
      }
    });
  }

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
