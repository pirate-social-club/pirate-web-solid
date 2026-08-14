import { chromium } from "playwright";

const base = process.env.WEB_SOLID_BASE_URL ?? "http://localhost:4173";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});

try {
  const page = await browser.newPage();
  const violations = [];
  let apiVersionRequests = 0;
  page.on("console", message => {
    if (message.type() === "error") violations.push(`console: ${message.text()}`);
  });
  page.on("pageerror", error => violations.push(`pageerror: ${error.message}`));
  page.on("requestfailed", request => violations.push(`request: ${request.url()} ${request.failure()?.errorText ?? "failed"}`));
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/__version") apiVersionRequests += 1;
  });
  const response = await page.goto(base, { waitUntil: "networkidle" });
  if (!response?.ok()) throw new Error(`SSR page returned ${response?.status()}`);

  const csp = response.headers()["content-security-policy"] ?? "";
  const nonce = csp.match(/nonce-([^']+)/)?.[1];
  if (!nonce) throw new Error("CSP nonce missing");
  const noncedScripts = await page.locator("script").evaluateAll((elements, expectedNonce) =>
    elements.every(element => element.nonce === expectedNonce || element.getAttribute("nonce") === expectedNonce),
    nonce,
  );
  if (!noncedScripts) throw new Error("SSR script missing nonce");

  const apiVersion = page.locator("#api-version");
  await apiVersion.waitFor({ state: "attached" });
  if (await apiVersion.getAttribute("data-api-status") !== "success") {
    throw new Error(`SSR API query did not resolve: ${await apiVersion.textContent()}`);
  }
  if (!(await apiVersion.textContent()).includes("api")) throw new Error("SSR API data is not visible in the streamed HTML");

  const feed = page.locator("#public-video-feed");
  await feed.waitFor({ state: "attached" });
  if (await feed.getAttribute("data-feed-status") !== "ready") throw new Error("SSR public video feed did not resolve");
  const feedItems = page.locator("[data-feed-item-id]");
  if (await feedItems.count() < 1) throw new Error("SSR public video feed returned no video cards");
  if (await page.locator("[data-feed-item-id] video[controls]").count() !== await feedItems.count()) {
    throw new Error("Every public feed card must expose reachable native video controls");
  }
  if (await page.locator('[data-feed-active="true"]').count() !== 1) throw new Error("Feed must have exactly one active item");

  const button = page.locator("#hydration-button");
  const before = await button.textContent();
  const markup = await button.evaluate(element => element.outerHTML);
  await button.click();
  const after = await button.textContent();
  if (before === after) throw new Error(`Hydration did not update state: ${before}; markup=${markup}; ${violations.join(" | ") || "no browser diagnostics"}`);

  const dialogTrigger = page.locator("#hydration-dialog-open");
  await dialogTrigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  if (await page.locator("#hydration-dialog-marker").textContent() !== "portal-ready") {
    throw new Error("Portalled design-system dialog did not render after hydration");
  }
  await page.getByRole("button", { name: "Close" }).click();
  await dialog.waitFor({ state: "hidden" });
  await dialogTrigger.focus();

  const displayName = page.locator("#hydration-display-name");
  if (await displayName.getAttribute("aria-describedby") !== "hydration-display-name-description") {
    throw new Error("TextField description wiring was not preserved through hydration");
  }
  await displayName.fill("Gate test");
  if (await displayName.inputValue() !== "Gate test") throw new Error("TextField controlled value did not update");
  if (apiVersionRequests !== 0) throw new Error(`Hydrated API query refetched ${apiVersionRequests} time(s)`);

  if (await feedItems.count() > 1) {
    await feedItems.nth(1).scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    if (await page.locator('[data-feed-active="true"]').count() !== 1) throw new Error("Feed changed to more than one active item");
  }

  const threadsLink = page.locator('a[href="/c/demo/threads"]').first();
  await threadsLink.click();
  await page.waitForURL(url => url.pathname === "/c/demo/threads");
  const threadsRoute = page.locator('[data-route-path="/c/:slug/threads"]');
  try {
    await threadsRoute.waitFor({ state: "attached", timeout: 5000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      markers: [...document.querySelectorAll("[data-route-path]")].map(element => element.getAttribute("data-route-path")),
      text: document.body.innerText,
      resources: performance.getEntriesByType("resource").map(entry => entry.name).filter(name => name.includes("assets/")),
    }));
    throw new Error(`Client navigation did not render the community threads route: ${JSON.stringify(state)} diagnostics=${violations.join(" | ") || "none"}; ${error.message}`);
  }
  if (await threadsRoute.count() !== 1) {
    const markers = await page.locator("[data-route-path]").evaluateAll(elements => elements.map(element => element.getAttribute("data-route-path")));
    throw new Error(`Client navigation did not render the community threads route: url=${page.url()} markers=${markers.join(",")} diagnostics=${violations.join(" | ") || "none"}`);
  }
  if (await threadsRoute.getAttribute("data-route-slug") !== "demo") throw new Error("Dynamic community slug was not preserved during client navigation");

  await page.reload({ waitUntil: "networkidle" });
  await page.locator('[data-route-path="/c/:slug/threads"]').waitFor({ state: "attached" });
  if (await page.locator('[data-route-path="/c/:slug/threads"]').count() !== 1) throw new Error("Dynamic route did not survive refresh");
  if (apiVersionRequests !== 0) throw new Error(`API query refetched during navigation/refresh (${apiVersionRequests})`);
  if (violations.length) throw new Error(`Browser console errors: ${violations.join(" | ")}`);

  console.log(JSON.stringify({ ok: true, before, after, navigated: "/c/demo/threads", nonceLength: nonce.length, apiVersionRequests, overlay: true, form: true }));
} finally {
  await browser.close();
}
