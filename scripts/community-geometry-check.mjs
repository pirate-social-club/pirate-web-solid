// Measures the community page shell in a real browser: the header, the tab bar
// and the top of the feed must not move as the viewer's authority settles, and
// asking for the community's details must produce a real view rather than a
// blank column. The persona/Post row appears only when it carries a control, so
// it may grow the feed downward; its own geometry is not a fixed reservation.
//
// Class-string assertions cannot establish equal geometry: they do not know
// what wraps, what a label does to a width, or what a viewport does to a flex
// row. This opens the geometry stories at a mobile and a desktop width, reads
// bounding boxes, and compares every settled state against the pending one.
//
// Needs a running Storybook, by default http://127.0.0.1:6006, the same
// harness the a11y sweep uses.

import { chromium } from "playwright";

const baseUrl = (process.env.STORYBOOK_BASE_URL ?? "http://127.0.0.1:6006").replace(/\/$/u, "");
const startupTimeoutMs = Number(process.env.GEOMETRY_STARTUP_TIMEOUT_MS ?? 30_000);

/** Subpixel differences are layout noise, not movement a reader can see. */
const tolerancePx = Number(process.env.GEOMETRY_TOLERANCE_PX ?? 0.5);

const pendingStory = "screens-community-pageshell--authority-pending";
const settledStories = [
  "screens-community-pageshell--settled-anonymous",
  "screens-community-pageshell--settled-member",
  "screens-community-pageshell--settled-moderator",
  "screens-community-pageshell--viewer-unknown",
];

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
];

/**
 * What must not move. The action row is the header's own geometry; the tab bar
 * and the top of the feed are everything the reader is actually looking at, so
 * their position is the real subject. The feed's height is excluded because the
 * persona/Post row grows the feed when it appears.
 */
const probes = [
  { key: "actions", selector: "[data-community-actions-reserved]", sides: ["x", "y", "width", "height"] },
  { key: "tabs", selector: "[data-community-tabs]", sides: ["x", "y", "width", "height"] },
  { key: "feed", selector: "[aria-label='Community feed']", sides: ["x", "y", "width"] },
];

async function measure(page, storyId, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`${baseUrl}/iframe.html?id=${storyId}&viewMode=story`, {
    waitUntil: "domcontentloaded",
    timeout: startupTimeoutMs,
  });
  await page.locator("[data-community-page]").first().waitFor({ state: "visible", timeout: startupTimeoutMs });
  const measured = {};
  // A fixed-height container hides its own overflow from a bounding box: the
  // box stays put while the content inside it spills over what follows. Read
  // the overflow directly so a control put back into a fixed row is caught at
  // every width, not only where it happens to widen the row.
  measured.actionsOverflow = await page.locator("[data-community-actions-reserved]").first()
    .evaluate(node => Math.max(0, node.scrollHeight - node.clientHeight, node.scrollWidth - node.clientWidth));
  for (const probe of probes) {
    const box = await page.locator(probe.selector).first().boundingBox().catch(() => null);
    if (box === null) throw new Error(`${storyId} at ${viewport.name}: nothing matched ${probe.selector}`);
    measured[probe.key] = { x: box.x, y: box.y, width: box.width, height: box.height };
  }
  return measured;
}

function compare(storyId, viewport, pending, settled) {
  const failures = [];
  for (const [state, measured] of [["pending", pending], [storyId, settled]]) {
    if (measured.actionsOverflow > tolerancePx) {
      failures.push(
        `${viewport.name} ${state}: the action row overflows its fixed height by `
        + `${measured.actionsOverflow.toFixed(2)}px, which covers what follows it`,
      );
    }
  }
  for (const probe of probes) {
    const before = pending[probe.key];
    const after = settled[probe.key];
    for (const side of probe.sides) {
      const moved = Math.abs(before[side] - after[side]);
      if (moved > tolerancePx) {
        failures.push(
          `${viewport.name} ${storyId}: ${probe.key} ${side} moved ${moved.toFixed(2)}px `
          + `(${before[side].toFixed(2)} -> ${after[side].toFixed(2)})`,
        );
      }
    }
  }
  return failures;
}

/**
 * The banner's overflow menu at one width. Community details must replace the
 * feed with the About panel, not leave an empty column beside an aside that
 * was already on screen, which is what a desktop-only escape hatch did.
 */
async function checkCommunityDetails(page, viewport) {
  const failures = [];
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`${baseUrl}/iframe.html?id=${settledStories[1]}&viewMode=story`, {
    waitUntil: "domcontentloaded",
    timeout: startupTimeoutMs,
  });
  const feed = page.locator("[aria-label='Community feed']").first();
  const about = page.locator("[aria-label='Community information']").first();
  await feed.waitFor({ state: "visible", timeout: startupTimeoutMs });

  await page.locator("[aria-label='More community options']").first().click();
  await page.getByRole("menuitem", { name: "Community details" }).click();

  if (await feed.isVisible()) {
    failures.push(`${viewport.name}: the feed is still on screen after asking for community details`);
  }
  if (!(await about.isVisible())) {
    failures.push(`${viewport.name}: community details left nothing on screen`);
  } else {
    const box = await about.boundingBox();
    // A real view, not a sidebar the reader was already looking at.
    if (box === null || box.width < viewport.width * 0.5) {
      failures.push(
        `${viewport.name}: the about panel is ${box === null ? "absent" : `${box.width.toFixed(0)}px`}`
        + `, narrower than half the ${viewport.width}px viewport`,
      );
    }
  }
  return failures;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const failures = [];
  try {
    for (const viewport of viewports) {
      const pending = await measure(page, pendingStory, viewport);
      for (const storyId of settledStories) {
        const settled = await measure(page, storyId, viewport);
        failures.push(...compare(storyId, viewport, pending, settled));
      }
      failures.push(...await checkCommunityDetails(page, viewport));
    }
  } finally {
    await page.close();
    await browser.close();
  }

  if (failures.length > 0) {
    for (const failure of failures) process.stderr.write(`${failure}\n`);
    process.stderr.write(`community-geometry-check: ${failures.length} movement(s) between pending and settled\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `community-geometry-check: ${settledStories.length} settled state(s) hold their geometry, `
    + `and community details opens a real view, `
    + `at ${viewports.map(viewport => `${viewport.width}px`).join(" and ")}\n`,
  );
}

await main();
