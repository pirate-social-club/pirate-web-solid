import { createServer } from "node:http";
import { expect, test, type Page } from "playwright/test";
import { assertStablePostingControl } from "./fixtures/publish-song.ts";
import { assertPromptSongHandoff, observeSongHandoff } from "./fixtures/song-handoff.ts";

test("@local-fixture accepts continuously available posting controls", async ({ page }) => {
  await page.setContent('<button>Next</button>');
  await assertStablePostingControl(page.getByRole("button", { name: "Next" }), 100);
});

for (const attribute of ["disabled", "aria-busy"] as const) {
  test(`@local-fixture rejects brief ${attribute} transitions between samples`, async ({ page }) => {
    await page.setContent('<button>Next</button>');
    await page.evaluate(name => {
      const button = document.querySelector("button")!;
      setInterval(() => {
        button.setAttribute(name, name === "disabled" ? "" : "true");
        button.removeAttribute(name);
      }, 10);
    }, attribute);
    await expect(assertStablePostingControl(page.getByRole("button", { name: "Next" }), 100)).rejects.toThrow();
  });
}

async function measureLocalHandoff(page: Page, options: {
  acknowledgmentDelayMs?: number;
  bodyDelayMs?: number;
  dismissalDelayMs?: number;
  dismissBeforeAcknowledgment?: boolean;
}) {
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/terms") {
      setTimeout(() => {
        response.writeHead(200, { "content-type": "application/json" });
        response.write("{");
        setTimeout(() => response.end('"accepted":true}'), options.bodyDelayMs ?? 0);
      }, options.acknowledgmentDelayMs ?? 0);
      return;
    }
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<form aria-label="Post a song"><button>Post</button></form>
      <script>
        const options = ${JSON.stringify(options)};
        const form = document.querySelector('form');
        form.onsubmit = async event => {
          event.preventDefault();
          const reply = fetch('/terms', { method: 'POST' });
          if (options.dismissBeforeAcknowledgment) form.remove();
          await (await reply).json();
          setTimeout(() => form.remove(), options.dismissalDelayMs ?? 0);
        };
      </script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  let observation: Awaited<ReturnType<typeof observeSongHandoff>> | undefined;
  try {
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Local fixture did not bind");
    await page.goto(`http://127.0.0.1:${address.port}`);
    const composer = page.getByRole("form", { name: "Post a song" });
    observation = await observeSongHandoff(composer);
    const accepted = page.waitForResponse(response => response.url().endsWith("/terms"));
    await page.getByRole("button", { name: "Post", exact: true }).click();
    const terms = await accepted;
    await expect(composer).toBeHidden();
    return await observation.measure(terms);
  } finally {
    try { await observation?.dispose(); }
    finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }
}

test("@local-fixture measures prompt dismissal after a slow terms request", async ({ page }) => {
  const timing = await measureLocalHandoff(page, { acknowledgmentDelayMs: 500, dismissalDelayMs: 20 });
  assertPromptSongHandoff(timing, 200);
});

test("@local-fixture measures acknowledgment after the complete response body", async ({ page }) => {
  const timing = await measureLocalHandoff(page, { bodyDelayMs: 500, dismissalDelayMs: 20 });
  expect(timing.termsAcknowledgedAtMs - timing.termsResponseStartedAtMs).toBeGreaterThanOrEqual(400);
  assertPromptSongHandoff(timing, 200);
});

test("@local-fixture rejects delayed dismissal even when the long wait would pass", async ({ page }) => {
  const timing = await measureLocalHandoff(page, { dismissalDelayMs: 500 });
  expect(() => assertPromptSongHandoff(timing, 200)).toThrow("Composer remained after terms acknowledgment");
});

test("@local-fixture rejects dismissal before terms acknowledgment", async ({ page }) => {
  const timing = await measureLocalHandoff(page, { acknowledgmentDelayMs: 500, dismissBeforeAcknowledgment: true });
  expect(() => assertPromptSongHandoff(timing, 200)).toThrow("Composer closed before terms acknowledgment");
});
