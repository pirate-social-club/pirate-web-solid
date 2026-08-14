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
  if (violations.length) throw new Error(`Browser console errors: ${violations.join(" | ")}`);

  console.log(JSON.stringify({ ok: true, before, after, nonceLength: nonce.length }));
} finally {
  await browser.close();
}
