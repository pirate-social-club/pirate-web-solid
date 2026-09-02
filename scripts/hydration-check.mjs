import { chromium } from "playwright";

const base = process.env.SOLID_BASE_URL ?? "http://localhost:4173";
const apiDown = process.env.SOLID_API_DOWN === "1";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});

try {
  const page = await browser.newPage();
  const errors = [];
  let anonymousSessionProbe = false;
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  page.on("response", response => {
    if (response.status() === 401 && new URL(response.url()).pathname === "/api/users/me") {
      anonymousSessionProbe = true;
    }
  });
  if (apiDown) {
    await page.route("**/api/feed/**", route => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "provider_unavailable", message: "API unavailable", retryable: true } }),
    }));
    await page.route("**/api/users/me", route => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "provider_unavailable", message: "API unavailable", retryable: true } }),
    }));
  }
  await page.route("**/favicon.ico", route => route.fulfill({ status: 204, body: "" }));
  const hydrationUrl = new URL(base);
  hydrationUrl.searchParams.set("hydration", "1");
  const response = await page.goto(hydrationUrl.toString(), { waitUntil: "networkidle" });
  if (!response?.ok()) throw new Error(`SSR page returned ${response?.status()}`);
  const csp = response.headers()["content-security-policy"] ?? "";
  const nonce = csp.match(/nonce-([^']+)/)?.[1];
  if (!nonce) throw new Error("CSP nonce missing");
  const noncedScripts = await page.locator("script").evaluateAll((elements, expectedNonce) =>
    elements.every(element => element.nonce === expectedNonce || element.getAttribute("nonce") === expectedNonce), nonce);
  if (!noncedScripts) throw new Error("SSR script missing nonce");

  await page.locator("#app-root[data-hydrated='true']").waitFor({ state: "attached" });
  if (apiDown) {
    await page.locator("[data-video-feed-state='error']").waitFor({ state: "visible" });
  }
  const feedState = page.locator("[data-video-feed-state]").first();
  await feedState.waitFor({ state: "visible" });
  const renderedFeedState = await feedState.getAttribute("data-video-feed-state");
  if (apiDown && renderedFeedState !== "error") throw new Error(`API-down feed state was ${renderedFeedState}`);
  const button = page.locator("#hydration-button");
  const before = await button.textContent();
  await button.evaluate(element => element.click());
  const after = await button.textContent();
  if (before === after) throw new Error("Hydration did not update state");

  const dialogTrigger = page.locator("#hydration-dialog-open");
  await dialogTrigger.evaluate(element => element.click());
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  if (await page.locator("#hydration-dialog-marker").textContent() !== "portal-ready") throw new Error("Dialog did not render after hydration");
  await page.getByRole("button", { name: "Close" }).click();
  await dialog.waitFor({ state: "hidden" });

  const signInButton = page.getByRole("button", { name: "Sign in" }).first();
  await signInButton.click();
  const signInDialog = page.getByRole("dialog", { name: "Join Pirate" });
  await signInDialog.waitFor({ state: "visible" });
  await signInDialog.getByRole("heading", { name: "Join Pirate" }).waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await signInDialog.waitFor({ state: "hidden" });

  const displayName = page.locator("#hydration-display-name");
  if (await displayName.getAttribute("aria-describedby") !== "hydration-display-name-description") throw new Error("TextField description wiring failed");
  await displayName.evaluate(element => {
    element.value = "Gate test";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  if (await displayName.inputValue() !== "Gate test") throw new Error("TextField value did not update");
  // The community creation route hydrates from SSR HTML and must settle on a
  // named state. A hydration fault there halts the reactive system, so the
  // route keeps its server-rendered spinner and never calls the session API.
  const creationResponse = await page.goto(new URL("/communities/new", base).toString(), { waitUntil: "networkidle" });
  if (!creationResponse?.ok()) throw new Error(`Creation SSR page returned ${creationResponse?.status()}`);
  await page.locator("#app-root[data-hydrated='true']").waitFor({ state: "attached" });
  const creationRoute = page.locator("main[data-route-path='/communities/new']");
  await creationRoute.waitFor({ state: "attached" });
  let creationState = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    creationState = await creationRoute.getAttribute("data-creation-state");
    if (creationState !== null && creationState !== "resolving") break;
    await page.waitForTimeout(250);
  }
  if (creationState === null) throw new Error("Creation route reported no state");
  if (creationState === "resolving") throw new Error("Creation route never left its loading fallback");

  const unexpectedErrors = errors.filter(error => !(
    (apiDown && error.includes("Failed to load resource: the server responded with a status of 503"))
    || (anonymousSessionProbe && error.includes("Failed to load resource: the server responded with a status of 401"))
    || error.includes("Failed to load resource: the server responded with a status of 404")
  ));
  if (unexpectedErrors.length) throw new Error(`Browser errors: ${unexpectedErrors.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, before, after, nonceLength: nonce.length, feedState: renderedFeedState, overlay: true, signInDialog: true, form: true, creationState, apiDown }));
} finally {
  await browser.close();
}
