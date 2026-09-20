import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "playwright/test";
import {
  completeStudySessionThroughUi,
  databaseRows,
  harnessManifest,
  type HarnessManifest,
  useAccount,
  waitForDatabaseRow,
} from "./fixtures/harness.ts";

/**
 * Study entry convergence coverage: every supported entry opens the first
 * exercise without a preparation gate, session starts are coordinated across
 * reloads and simultaneous tabs, an uncertain start resolves with the same key,
 * a deliberate later lesson still creates a new session, and consent still
 * gates capture. Persisted session rows are asserted alongside screen state.
 */

let manifest: HarnessManifest;
test.beforeAll(() => {
  manifest = harnessManifest();
});

interface SessionRow {
  readonly session_id: string;
  readonly status: string;
}

const sessionsFor = (accountId: string): SessionRow[] =>
  databaseRows<SessionRow>(
    `SELECT session_id, status FROM study_sessions_v2
      WHERE account_id='${accountId}' ORDER BY created_at`,
  );

const audioFor = (accountId: string): { readonly count: number }[] =>
  databaseRows<{ count: number }>(
    `SELECT count(*)::int AS count FROM learner_audio_artifacts WHERE account_id='${accountId}'`,
  );

const databaseContainer =
  process.env.HARNESS_PG_CONTAINER?.trim() || "study-karaoke-harness-pg17";

/** Advance the review schedule the same way an elapsed interval would. */
function advanceReviewSchedule(accountId: string): void {
  execFileSync(
    "docker",
    [
      "exec",
      databaseContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `SET search_path=api_next; UPDATE study_review_items SET due_at=clock_timestamp() - interval '1 hour' WHERE account_id='${accountId}'`,
    ],
    { encoding: "utf8" },
  );
}

const recordButton = (page: Page) =>
  page.getByRole("button", { name: "Record", exact: true });

const expectFirstExercise = async (page: Page): Promise<void> => {
  await expect(recordButton(page)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("Start Study", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Speaking practice only", { exact: true })).toHaveCount(0);
};

const studyUrl = (): string => `/posts/${manifest.postSlug}/study`;

test("the direct Study URL opens the first exercise with exactly one session", async ({
  context,
  page,
}) => {
  const account = await useAccount(context, manifest, 0);
  await page.goto(studyUrl());
  await expectFirstExercise(page);
  const sessions = await waitForDatabaseRow<SessionRow>(
    `SELECT session_id, status FROM study_sessions_v2 WHERE account_id='${account.accountId}'`,
    (rows) => rows.length === 1,
  );
  expect(sessions[0]?.status).toBe("active");
});

test("the post page Study link opens the first exercise", async ({ context, page }) => {
  const account = await useAccount(context, manifest, 1);
  await page.goto(`/posts/${manifest.postSlug}`);
  await page.getByRole("link", { name: "Study", exact: true }).click();
  await expectFirstExercise(page);
  const sessions = await waitForDatabaseRow<SessionRow>(
    `SELECT session_id, status FROM study_sessions_v2 WHERE account_id='${account.accountId}'`,
    (rows) => rows.length === 1,
  );
  expect(sessions[0]?.status).toBe("active");
});

// The local app mounts the video feed on the home tab, so the deployed
// "second mobile tab" journey is exercised by entering the feed through the
// footer navigation rather than by URL. The seed carries three video posts:
// one linked to the eligible practice song, one with original audio, and one
// linked to a published song without Study exercises.
test("the mobile video feed opens Study for a video with a ready referenced song", async ({
  context,
  page,
}) => {
  const account = await useAccount(context, manifest, 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/communities");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.locator("main[data-video-feed-state]")).toHaveAttribute(
    "data-video-feed-state",
    "ready",
    { timeout: 30_000 },
  );

  // Exactly the linked video offers Study, and it points at the referenced
  // song; the unlinked video and the unavailable-song video render nothing.
  const study = page.locator("[data-video-feed-study]");
  await expect(study).toHaveCount(1, { timeout: 30_000 });
  await expect(study).toHaveAttribute("href", `/p/${manifest.postId}/study`);
  const rows = page.locator('[role="region"] > div');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Harness linked video");
  await expect(rows.nth(0).locator("[data-video-feed-study]")).toHaveCount(1);
  await expect(rows.nth(1)).toContainText("Harness unlinked video");
  await expect(rows.nth(1).locator("[data-video-feed-study]")).toHaveCount(0);
  await expect(rows.nth(2)).toContainText("Harness unavailable-song video");
  await expect(rows.nth(2).locator("[data-video-feed-study]")).toHaveCount(0);

  await study.click();
  await expect(page).toHaveURL(new RegExp(`/p/${manifest.postId}/study$`, "u"));
  await expectFirstExercise(page);
  const sessions = await waitForDatabaseRow<SessionRow>(
    `SELECT session_id, status FROM study_sessions_v2 WHERE account_id='${account.accountId}'`,
    (rows) => rows.length === 1,
  );
  expect(sessions).toHaveLength(1);
  expect(sessions[0]?.status).toBe("active");
});
test("a reload resumes the same session without creating another", async ({ context, page }) => {
  const account = await useAccount(context, manifest, 3);
  await page.goto(studyUrl());
  await expectFirstExercise(page);
  const [first] = await waitForDatabaseRow<SessionRow>(
    `SELECT session_id, status FROM study_sessions_v2 WHERE account_id='${account.accountId}'`,
    (rows) => rows.length === 1,
  );
  await page.reload();
  await expectFirstExercise(page);
  const sessions = sessionsFor(account.accountId);
  expect(sessions).toHaveLength(1);
  expect(sessions[0]?.session_id).toBe(first?.session_id);
});

test("two tabs entering together share one session", async ({ context, page }) => {
  const account = await useAccount(context, manifest, 4);
  const other = await context.newPage();
  try {
    await Promise.all([
      page.goto(studyUrl()).then(() => expectFirstExercise(page)),
      other.goto(studyUrl()).then(() => expectFirstExercise(other)),
    ]);
    const sessions = await waitForDatabaseRow<SessionRow>(
      `SELECT session_id, status FROM study_sessions_v2 WHERE account_id='${account.accountId}'`,
      (rows) => rows.length === 1,
    );
    expect(sessions).toHaveLength(1);
  } finally {
    await other.close();
  }
});

test("a lost start response resolves with the same key into one session", async ({
  context,
  page,
}) => {
  const account = await useAccount(context, manifest, 5);
  let aborted = false;
  await page.route("**/study/v2/sessions", async (route) => {
    if (!aborted && route.request().method() === "POST") {
      aborted = true;
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.goto(studyUrl());
  await expectFirstExercise(page);
  expect(aborted).toBe(true);
  const sessions = await waitForDatabaseRow<SessionRow>(
    `SELECT session_id, status FROM study_sessions_v2 WHERE account_id='${account.accountId}'`,
    (rows) => rows.length === 1,
  );
  expect(sessions).toHaveLength(1);
});

test("a deliberate new lesson after completion creates a second session", async ({
  context,
  page,
}) => {
  const account = await useAccount(context, manifest, 6);
  await page.goto(studyUrl());
  await expectFirstExercise(page);
  await completeStudySessionThroughUi(page, manifest);
  const studyAgain = page.getByRole("button", { name: "Study again", exact: true });
  await expect(studyAgain).toBeVisible({ timeout: 120_000 });
  // A later lesson is legitimate only once the review schedule is due again;
  // that authoritative server state is advanced here, not assumed.
  advanceReviewSchedule(account.accountId);
  await studyAgain.click();
  await expectFirstExercise(page);
  const sessions = await waitForDatabaseRow<SessionRow>(
    `SELECT session_id, status FROM study_sessions_v2 WHERE account_id='${account.accountId}'`,
    (rows) => rows.length === 2,
  );
  expect(sessions.map((session) => session.status).sort()).toEqual(["active", "completed"]);
});

test("cancelling the disclosure leaves no audio and no second session", async ({
  context,
  page,
}) => {
  const account = await useAccount(context, manifest, 7);
  await page.goto(studyUrl());
  await expectFirstExercise(page);
  await recordButton(page).click();
  const disclosure = page.locator("[data-study-mic-disclosure]");
  await expect(disclosure).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(disclosure).toHaveCount(0);
  await expect(recordButton(page)).toBeVisible();
  await expect
    .poll(() => sessionsFor(account.accountId).length, { timeout: 15_000 })
    .toBe(1);
  expect(audioFor(account.accountId)[0]?.count).toBe(0);

  // Accepting the disclosure on the next attempt starts capture.
  await recordButton(page).click();
  await expect(disclosure).toBeVisible();
  await page.locator("[data-study-mic-disclosure-accept]").click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
});
