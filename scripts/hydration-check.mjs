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
  let retryAccountResponse;
  let accountRetryRequests = 0;
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  page.on("response", response => {
    if (response.status() === 401 && new URL(response.url()).pathname === "/api/users/me") {
      anonymousSessionProbe = true;
    }
  });
  if (apiDown) {
    await page.route("**/api/personas", route => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "provider_unavailable", message: "API unavailable", retryable: true } }),
    }));
    await page.route("**/api/feed/**", route => route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "provider_unavailable", message: "API unavailable", retryable: true } }),
    }));
    await page.route("**/api/users/me", async route => {
      if (retryAccountResponse) {
        accountRetryRequests += 1;
        await retryAccountResponse;
        return route.fulfill({ status: 401, contentType: "application/json",
          body: JSON.stringify({ error: { code: "auth_error", message: "Not signed in", retryable: false } }) });
      }
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "provider_unavailable", message: "API unavailable", retryable: true } }),
      });
    });
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

  if (apiDown) {
    let releaseRetry;
    retryAccountResponse = new Promise(resolve => { releaseRetry = resolve; });
    const retry = page.getByRole("button", { name: "Retry account check" }).first();
    await retry.waitFor();
    const accountRequest = page.waitForRequest("**/api/users/me");
    await retry.click();
    await accountRequest;
    if (await page.getByRole("button", { name: "Sign in", exact: true }).count()) {
      throw new Error("Account retry temporarily rendered signed-out chrome");
    }
    const checking = page.getByRole("button", { name: "Checking account", exact: true }).first();
    if (!await checking.isVisible() || !await checking.isDisabled()) throw new Error("Account retry must show disabled pending feedback");
    // This pins native disabled-control behavior, not the handler's separate
    // in-flight guard (disabled clicks do not reach that handler).
    await checking.evaluate(element => { element.click(); element.click(); });
    releaseRetry();
  }
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  if (apiDown && accountRetryRequests !== 1) throw new Error(`Account retry issued ${accountRetryRequests} requests`);
  retryAccountResponse = undefined;
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
  // The editable form must be present in SSR HTML before any session request.
  // Hydration must retain it for anonymous visitors and failed session reads.
  // The shell and the creation route share one coalesced session resolution,
  // so exactly one anonymous users/me probe may leave this page. The counter
  // is attached before the navigation so it observes every request.
  let usersMeRequests = 0;
  const countAccountRequest = request => {
    if (new URL(request.url()).pathname === "/api/users/me") usersMeRequests += 1;
  };
  page.on("request", countAccountRequest);
  const creationResponse = await page.goto(new URL("/communities/new", base).toString(), { waitUntil: "networkidle" });
  if (!creationResponse?.ok()) throw new Error(`Creation SSR page returned ${creationResponse?.status()}`);
  const creationHtml = await creationResponse.text();
  if (!creationHtml.includes("data-create-community") || creationHtml.includes("Loading community creation")) {
    throw new Error("Creation SSR must contain the form without a loading fallback");
  }
  await page.locator("#app-root[data-hydrated='true']").waitFor({ state: "attached" });
  await page.locator("form[data-create-community]").waitFor({ state: "visible" });
  const creationRoute = page.locator("main[data-route-path='/communities/new']");
  await creationRoute.waitFor({ state: "attached" });
  let creationState = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    creationState = await creationRoute.getAttribute("data-creation-state");
    if (creationState !== null && creationState !== "resolving") break;
    await page.waitForTimeout(250);
  }
  if (creationState === null) throw new Error("Creation route reported no state");
  if (creationState === "resolving") throw new Error("Creation session resolution never settled");
  if (usersMeRequests !== 1) {
    throw new Error(`Creation page issued ${usersMeRequests} users/me requests; the shared session store must issue exactly one`);
  }

  page.off("request", countAccountRequest);

  if (apiDown) {
    // Authenticate independently of a failed profile read, then hold the retry
    // to prove that authenticated chrome and the typed form remain stable.
    let releaseAccount;
    let accountGate = new Promise(resolve => { releaseAccount = resolve; });
    await page.unroute("**/api/users/me");
    await page.route("**/api/users/me", async route => {
      await accountGate;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        id: "user-browser-check", object: "user", verification_state: "unverified", created: 1788495833,
        verification_capabilities: Object.fromEntries(
          ["unique_human", "age_over_18", "minimum_age", "nationality", "gender", "wallet_score"]
            .map(key => [key, { state: "unverified" }])),
      }) });
    });
    await page.goto(new URL("/communities/new", base).toString(), { waitUntil: "domcontentloaded" });
    await page.locator("#app-root[data-hydrated='true']").waitFor({ state: "attached" });
    if (await page.locator("[data-shell-auth]").getAttribute("data-shell-auth") !== "resolving") {
      throw new Error("Initial account check must have neutral chrome");
    }
    if (await page.getByRole("button", { name: "Sign in", exact: true }).count()) {
      throw new Error("Initial account check must not advertise sign-in");
    }
    await page.locator("form input").first().fill("Retained browser draft");
    releaseAccount();
    await page.locator("[data-shell-auth='authenticated']").waitFor();
    const profileRetry = page.getByRole("button", { name: "Retry profiles", exact: true });
    await profileRetry.waitFor();
    accountGate = new Promise(resolve => { releaseAccount = resolve; });
    const retryRequest = page.waitForRequest("**/api/users/me");
    await profileRetry.click();
    await retryRequest;
    if (await page.locator("[data-shell-auth]").getAttribute("data-shell-auth") !== "authenticated") {
      throw new Error("Background refresh discarded authenticated chrome");
    }
    const sidebar = page.locator("aside");
    if (!await sidebar.getByText("Session active", { exact: true }).isVisible()) {
      throw new Error("Authenticated footer detail changed during background refresh");
    }
    if (!await sidebar.getByRole("link", { name: "Account settings" }).isVisible()) {
      throw new Error("Background refresh removed account settings access");
    }
    releaseAccount();
    await profileRetry.waitFor();
    if (await page.locator("form input").first().inputValue() !== "Retained browser draft") {
      throw new Error("Profile retry discarded the draft");
    }
  }

  const unexpectedErrors = errors.filter(error => !(
    (apiDown && error.includes("Failed to load resource: the server responded with a status of 503"))
    || (anonymousSessionProbe && error.includes("Failed to load resource: the server responded with a status of 401"))
    || error.includes("Failed to load resource: the server responded with a status of 404")
  ));
  if (unexpectedErrors.length) throw new Error(`Browser errors: ${unexpectedErrors.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, before, after, nonceLength: nonce.length, feedState: renderedFeedState, overlay: true, signInDialog: true, form: true, creationState, usersMeRequests, apiDown }));
} finally {
  await browser.close();
}
