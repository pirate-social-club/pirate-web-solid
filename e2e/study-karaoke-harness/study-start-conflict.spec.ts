import { expect, test, type Page } from "playwright/test";
import {
  databaseRows,
  harnessManifest,
  useAccount,
  type HarnessAccount,
  type HarnessManifest,
} from "./fixtures/harness.ts";

/**
 * Regression for the two Study-start conflicts seen in the first combined
 * suite run. A concurrent consumer of the shared harness database had already
 * created the account's active session and its not-due review items, so the
 * first start from a fresh browser was refused by the spaced-repetition
 * policy (409 `insufficient-exercises`, "Study content is not ready"). This
 * journey recreates that state deterministically and asserts the client names
 * it as scheduled review rather than a changed request, and that the refused
 * start persisted nothing.
 */

let manifest: HarnessManifest;
test.beforeAll(() => {
  manifest = harnessManifest();
});

interface SessionRow {
  readonly session_id: string;
  readonly status: string;
}

/** The pre-start runs from the page so the browser's Secure host-only cookies
 * are sent exactly as the application sends them. */
async function preStartSession(
  page: Page,
  account: HarnessAccount,
  timezone: string,
): Promise<{ readonly status: number; readonly sessionId: string }> {
  return page.evaluate(async ({ communityId, csrf, path, postId, personaId, timezone: zone }) => {
    const response = await fetch(
      `/api/communities/${communityId}/posts/${postId}/study/v2/sessions`,
      {
        body: JSON.stringify({
          idempotency_key: `interference:${personaId}`,
          learner_band: null,
          persona_id: personaId,
          target_language: null,
          timezone: zone,
        }),
        credentials: "same-origin",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        method: "POST",
      },
    );
    const body = (await response.json()) as { readonly session_id?: string };
    return { status: response.status, sessionId: body.session_id ?? "" };
  }, {
    communityId: manifest.communityId,
    csrf: manifest.csrfToken,
    path: "",
    postId: manifest.postId,
    personaId: account.personaId,
    timezone,
  }).catch((error) => ({ status: 0, sessionId: String(error) }));
}

test("a not-due start is named as scheduled review, not a changed request", async ({
  context,
  page,
}) => {
  const account = await useAccount(context, manifest, 24);
  await page.setViewportSize({ width: 390, height: 844 });
  // Any application page gives the fetch a same-origin context with cookies.
  await page.goto("/communities");
  const timezone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const preStarted = await preStartSession(page, account, timezone);
  expect(preStarted.status).toBe(201);
  expect(preStarted.sessionId).not.toBe("");

  const starts: { readonly status: number; readonly body: string }[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/study/v2/sessions") && response.request().method() === "POST") {
      void response.text().then(body => starts.push({ status: response.status(), body }));
    }
  });

  await page.goto(`/posts/${manifest.postSlug}`);
  await page.getByRole("link", { name: "Study", exact: true }).click();
  await expect(
    page.getByText("This song's Study cards are not ready for a new session yet. The review is scheduled; try again when it is due."),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText("Study could not start this session because its request changed.", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record", exact: true })).toHaveCount(0);

  // The exact refused response and its identity are part of the regression.
  await expect.poll(() => starts.length).toBe(1);
  expect(starts[0]?.status).toBe(409);
  expect(starts[0]?.body).toContain("Study content is not ready");

  // The refusal persisted nothing: only the pre-existing active session remains.
  const sessions = databaseRows<SessionRow>(
    `SELECT session_id, status FROM study_sessions_v2 WHERE account_id='${account.accountId}' ORDER BY created_at`,
  );
  expect(sessions).toHaveLength(1);
  expect(sessions[0]?.session_id).toBe(preStarted.sessionId);
  expect(sessions[0]?.status).toBe("active");
});
