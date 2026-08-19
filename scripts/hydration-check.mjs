import { chromium } from "playwright";

const base = process.env.SOLID_BASE_URL ?? "http://localhost:4173";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  const hydrationUrl = new URL(base);
  hydrationUrl.searchParams.set("hydration", "1");
  const response = await page.goto(hydrationUrl, { waitUntil: "networkidle" });
  if (!response?.ok()) throw new Error(`SSR page returned ${response?.status()}`);
  const csp = response.headers()["content-security-policy"] ?? "";
  const nonce = csp.match(/nonce-([^']+)/)?.[1];
  if (!nonce) throw new Error("CSP nonce missing");
  const noncedScripts = await page.locator("script").evaluateAll((elements, expectedNonce) =>
    elements.every(element => element.nonce === expectedNonce || element.getAttribute("nonce") === expectedNonce), nonce);
  if (!noncedScripts) throw new Error("SSR script missing nonce");

  await page.locator("#app-root[data-hydrated='true']").waitFor({ state: "attached" });
  const button = page.locator("#hydration-button");
  const before = await button.textContent();
  await button.click();
  const after = await button.textContent();
  if (before === after) throw new Error("Hydration did not update state");

  const dialogTrigger = page.locator("#hydration-dialog-open");
  await dialogTrigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  if (await page.locator("#hydration-dialog-marker").textContent() !== "portal-ready") throw new Error("Dialog did not render after hydration");
  await page.getByRole("button", { name: "Close" }).click();
  await dialog.waitFor({ state: "hidden" });

  const displayName = page.locator("#hydration-display-name");
  if (await displayName.getAttribute("aria-describedby") !== "hydration-display-name-description") throw new Error("TextField description wiring failed");
  await displayName.fill("Gate test");
  if (await displayName.inputValue() !== "Gate test") throw new Error("TextField value did not update");
  if (errors.length) throw new Error(`Browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, before, after, nonceLength: nonce.length, overlay: true, form: true }));
} finally {
  await browser.close();
}
