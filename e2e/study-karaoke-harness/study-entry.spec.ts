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

// Verified gap, 2026-09-19: with the harness seed now projecting the song into
// `home_feed_projection` (GET /feed/home returns the item), the mounted home
// feed still renders its video-only empty state, "No videos yet. Published
// community videos will appear here.", because the item is a song and
// `HomeVideoFeed` only renders video rows. No mounted surface renders the feed
// card that carries the Study link: `FeedItemCard`/`FeedSurface` in
// `public-feed.tsx` are used only by tests and by `home-feed.tsx`, which is not
// mounted. The shipped Study entries are the public post page link/inline view
// and the direct routes, both covered above. This test stays fixme until a
// Study action exists on a mounted feed surface.
test.fixme("the feed Study entry opens the first exercise (no mounted feed Study action)", async () => {
  throw new Error("the mounted home feed renders no Study action for a song-only feed");
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
