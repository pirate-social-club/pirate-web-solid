import { chromium } from "playwright";

const base = process.env.WEB_SOLID_BASE_URL ?? "http://127.0.0.1:4173";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});

try {
  const page = await browser.newPage();
  const violations = [];
  page.on("console", message => {
    if (message.type() === "error") violations.push(`console: ${message.text()}`);
  });
  page.on("pageerror", error => violations.push(`pageerror: ${error.message}`));
  page.on("requestfailed", request => violations.push(`request: ${request.url()} ${request.failure()?.errorText ?? "failed"}`));
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

  const button = page.locator("#hydration-button");
  const before = await button.textContent();
  const markup = await button.evaluate(element => element.outerHTML);
  await button.click();
  const after = await button.textContent();
  if (before === after) throw new Error(`Hydration did not update state: ${before}; markup=${markup}; ${violations.join(" | ") || "no browser diagnostics"}`);

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
  if (violations.length) throw new Error(`Browser console errors: ${violations.join(" | ")}`);

  console.log(JSON.stringify({ ok: true, before, after, navigated: "/c/demo/threads", nonceLength: nonce.length }));
} finally {
  await browser.close();
}
