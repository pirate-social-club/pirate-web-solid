import { expect, test } from "playwright/test";
import {
  answerStudyCardThroughUi,
  completeStudySessionThroughUi,
  currentStudyPrompt,
  databaseRows,
  harnessManifest,
  resetStudyScripts,
  useAccount,
  waitForDatabaseRow,
  waitForStudyLessonAction,
} from "./fixtures/harness.ts";

/**
 * Real Solid UI Study journeys against the local harness Worker and disposable
 * PostgreSQL. Only the speech provider is scripted (armed transcripts); the
 * session state machine, grading, persistence and completion are real.
 *
 * Each test owns a distinct synthetic account so spaced-repetition scheduling
 * and completion effects stay isolated.
 */
const manifest = harnessManifest();

interface SessionRow {
  readonly session_id: string;
  readonly status: string;
}

interface AttemptSummary {
  readonly attempts: number;
  readonly first_pass_correct: number;
  readonly incorrect: number;
}

function attemptSummary(accountId: string): AttemptSummary[] {
  return databaseRows<AttemptSummary>(
    `SELECT count(*)::int AS attempts,
            count(*) FILTER (WHERE attempt.outcome='correct' AND attempt.first_pass)::int AS first_pass_correct,
            count(*) FILTER (WHERE attempt.outcome='incorrect')::int AS incorrect
       FROM study_attempts_v2 attempt
       JOIN study_session_items_v2 item ON item.session_item_id=attempt.session_item_id
       JOIN study_sessions_v2 session ON session.session_id=item.session_id
      WHERE session.account_id='${accountId}'`,
  );
}

function studyQualifications(accountId: string): { readonly count: number }[] {
  return databaseRows<{ count: number }>(
    `SELECT count(*)::int AS count FROM activity_qualifications
      WHERE account_id='${accountId}' AND activity_key='study'`,
  );
}

async function startStudyLesson(page: import("playwright/test").Page): Promise<void> {
  // A previously failed interaction can leave armed scripts unconsumed; each
  // journey starts from an empty script queue so its transcripts are exact.
  await resetStudyScripts(manifest);
  await page.goto(`/posts/${manifest.postSlug}/study`);
  await expect(page.getByRole("heading", { name: "Start Study" })).toBeVisible();
  const start = page.getByRole("button", { name: "Start", exact: true });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByRole("button", { name: "Record", exact: true })).toBeVisible();
}

async function answerCurrentCard(
  page: import("playwright/test").Page,
  transcript: string,
): Promise<void> {
  await answerStudyCardThroughUi(page, manifest, transcript);
}

test.describe("local Study journey", () => {
  test("a learner completes a say-it-back lesson with persisted grading and one completion effect", async ({
    context,
    page,
  }) => {
    const account = await useAccount(context, manifest, 0);
    await startStudyLesson(page);
    await completeStudySessionThroughUi(page, manifest);

    const sessions = await waitForDatabaseRow<SessionRow>(
      `SELECT session_id, status FROM study_sessions_v2 WHERE account_id='${account.accountId}'`,
      (rows) => rows.some((row) => row.status === "completed"),
    );
    expect(sessions.filter((row) => row.status === "completed")).toHaveLength(1);

    const attempts = await waitForDatabaseRow<AttemptSummary>(
      `SELECT count(*)::int AS attempts,
              count(*) FILTER (WHERE attempt.outcome='correct' AND attempt.first_pass)::int AS first_pass_correct,
              count(*) FILTER (WHERE attempt.outcome='incorrect')::int AS incorrect
         FROM study_attempts_v2 attempt
         JOIN study_session_items_v2 item ON item.session_item_id=attempt.session_item_id
         JOIN study_sessions_v2 session ON session.session_id=item.session_id
        WHERE session.account_id='${account.accountId}'`,
      (rows) => (rows[0]?.attempts ?? 0) >= 4,
    );
    expect(attempts[0]).toMatchObject({ attempts: 4, first_pass_correct: 4, incorrect: 0 });

    const qualifications = studyQualifications(account.accountId);
    expect(qualifications[0]?.count).toBe(1);
  });

  test("wrong words persist an incorrect first pass and the miss returns before completion", async ({
    context,
    page,
  }) => {
    const account = await useAccount(context, manifest, 1);
    await startStudyLesson(page);
    await answerCurrentCard(page, "completely different words");
    await expect(page.getByText("Incorrect", { exact: false })).toBeVisible();

    const missed = await waitForDatabaseRow<{ outcome: string; first_pass: boolean }>(
      `SELECT attempt.outcome, attempt.first_pass
         FROM study_attempts_v2 attempt
         JOIN study_session_items_v2 item ON item.session_item_id=attempt.session_item_id
         JOIN study_sessions_v2 session ON session.session_id=item.session_id
        WHERE session.account_id='${account.accountId}'`,
      (rows) => rows.length === 1,
    );
    // `first_pass` identifies the first presentation attempt, not its outcome:
    // this row is a first-pass miss.
    expect(missed[0]).toEqual({ outcome: "incorrect", first_pass: true });

    // Continue the lesson; the miss returns later and is answered correctly.
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await completeStudySessionThroughUi(page, manifest);

    const attempts = await waitForDatabaseRow<AttemptSummary>(
      `SELECT count(*)::int AS attempts,
              count(*) FILTER (WHERE attempt.outcome='correct' AND attempt.first_pass)::int AS first_pass_correct,
              count(*) FILTER (WHERE attempt.outcome='incorrect')::int AS incorrect
         FROM study_attempts_v2 attempt
         JOIN study_session_items_v2 item ON item.session_item_id=attempt.session_item_id
         JOIN study_sessions_v2 session ON session.session_id=item.session_id
        WHERE session.account_id='${account.accountId}'`,
      (rows) => (rows[0]?.incorrect ?? 0) === 1,
    );
    expect(attempts[0]).toMatchObject({ first_pass_correct: 3, incorrect: 1 });
    expect(studyQualifications(account.accountId)[0]?.count).toBe(1);
  });

  test("an omitted negation is graded incorrect and the missing token is persisted", async ({
    context,
    page,
  }) => {
    const account = await useAccount(context, manifest, 2);
    await startStudyLesson(page);
    let graded = false;
    for (let card = 0; card < 6 && !graded; card += 1) {
      const action = await waitForStudyLessonAction(page);
      if (action === "complete") break;
      if (action === "continue") {
        await page.getByRole("button", { name: "Continue", exact: true }).click();
        continue;
      }
      const prompt = await currentStudyPrompt(page);
      if (prompt === manifest.negationLine) {
        const omitted = manifest.negationLine.replace(/\bNever\b/iu, "").replace(/\s+/gu, " ").trim();
        await answerCurrentCard(page, omitted);
        await expect(page.getByText("Incorrect", { exact: false })).toBeVisible();
        graded = true;
        break;
      }
      await answerCurrentCard(page, prompt);
    }
    expect(graded).toBe(true);

    const rows = await waitForDatabaseRow<{ outcome: string; missing: string }>(
      `SELECT attempt.outcome,
              coalesce(attempt.feedback_evidence->>'missing', '') AS missing
         FROM study_attempts_v2 attempt
         JOIN study_session_items_v2 item ON item.session_item_id=attempt.session_item_id
         JOIN study_sessions_v2 session ON session.session_id=item.session_id
        WHERE session.account_id='${account.accountId}'`,
      (all) => all.some((row) => row.outcome === "incorrect"),
    );
    const miss = rows.find((row) => row.outcome === "incorrect");
    expect(miss?.missing.toLowerCase()).toContain("never");
  });

  test("duplicate submission replay and reload leave one persisted attempt", async ({
    context,
    page,
  }) => {
    const account = await useAccount(context, manifest, 3);
    await resetStudyScripts(manifest);
    // Duplicate the first answer submission at the browser boundary: the same
    // request (same idempotency key and body) is sent twice, and the server
    // must answer the replay from the stored result without a second effect.
    let duplicate: { readonly status: number; readonly body: string } | undefined;
    let originalBody: string | undefined;
    await page.route("**/answers", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (duplicate === undefined && route.request().method() === "POST") {
        // Lost-response replay: the identical submission is sent again and must
        // answer with the stored result byte for byte.
        const second = await route.fetch();
        duplicate = { status: second.status(), body: await second.text() };
        originalBody = body;
      }
      await route.fulfill({ response, body });
    });
    await page.goto(`/posts/${manifest.postSlug}/study`);
    await expect(page.getByRole("heading", { name: "Start Study" })).toBeVisible();
    const start = page.getByRole("button", { name: "Start", exact: true });
    await expect(start).toBeEnabled();
    await start.click();
    await expect(page.getByRole("button", { name: "Record", exact: true })).toBeVisible();
    const reference = await currentStudyPrompt(page);
    await answerStudyCardThroughUi(page, manifest, reference);

    for (let tick = 0; tick < 40 && duplicate === undefined; tick += 1) {
      await page.waitForTimeout(250);
    }
    expect(duplicate?.status).toBe(200);
    expect(duplicate?.body).toBe(originalBody);
    expect(originalBody).toContain('"object":"study_answer_result_v2"');

    const afterReplay = attemptSummary(account.accountId);
    expect(afterReplay[0]?.attempts).toBe(1);

    await page.reload();
    await expect(
      page
        .getByRole("heading", { name: "Start Study" })
        .or(page.getByText("Study content is not ready", { exact: false })),
    ).toBeVisible({ timeout: 30_000 });

    const sessions = databaseRows<SessionRow>(
      `SELECT session_id, status FROM study_sessions_v2 WHERE account_id='${account.accountId}' ORDER BY created_at`,
    );
    expect(sessions).toHaveLength(1);
    expect(attemptSummary(account.accountId)[0]?.attempts).toBe(1);
    expect(studyQualifications(account.accountId)[0]?.count).toBe(0);
  });

  test("a provider failure fabricates nothing and a new recording retries to one completion", async ({
    context,
    page,
  }) => {
    const account = await useAccount(context, manifest, 5);
    const submittedKeys: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "POST" || !request.url().includes("/answers")) return;
      const key = request.headers()["idempotency-key"];
      if (key !== undefined) submittedKeys.push(key);
    });
    await startStudyLesson(page);
    const reference = await currentStudyPrompt(page);
    const action = await answerStudyCardThroughUi(page, manifest, "unavailable", {
      failure: "unavailable",
    });
    // The card returns to an answerable state and surfaces the provider error.
    expect(action).toBe("record");
    await expect(
      page.getByText(/transcription is unavailable|could not check this attempt/iu),
    ).toBeVisible();

    // Nothing may be fabricated by a provider failure: no attempt row, no
    // completion and no qualification.
    expect(attemptSummary(account.accountId)[0]?.attempts).toBe(0);
    expect(studyQualifications(account.accountId)[0]?.count).toBe(0);
    const sessions = databaseRows<SessionRow>(
      `SELECT session_id, status FROM study_sessions_v2 WHERE account_id='${account.accountId}'`,
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.status).toBe("active");
    const commands = databaseRows<{ state: string; provider_failure_kind: string | null }>(
      `SELECT command.state, command.provider_failure_kind
         FROM study_spoken_answer_commands command
         JOIN study_sessions_v2 session ON session.session_id=command.session_id
        WHERE session.account_id='${account.accountId}'`,
    );
    expect(commands).toEqual([{ state: "retryable_failed", provider_failure_kind: "unavailable" }]);

    // Newly recorded audio is a new submission: it must not reuse the key bound
    // to the failed recording, and the server reclaims the same logical attempt.
    await answerStudyCardThroughUi(page, manifest, reference);
    expect(submittedKeys.length).toBeGreaterThanOrEqual(2);
    expect(submittedKeys[0]).not.toBe(submittedKeys[1]);
    await completeStudySessionThroughUi(page, manifest);

    const retried = await waitForDatabaseRow<{ attempts: number; first_pass_correct: number }>(
      `SELECT count(*)::int AS attempts,
              count(*) FILTER (WHERE attempt.outcome='correct' AND attempt.first_pass)::int AS first_pass_correct
         FROM study_attempts_v2 attempt
         JOIN study_session_items_v2 item ON item.session_item_id=attempt.session_item_id
         JOIN study_sessions_v2 session ON session.session_id=item.session_id
        WHERE session.account_id='${account.accountId}'`,
      (rows) => (rows[0]?.attempts ?? 0) === 4,
    );
    expect(retried[0]).toEqual({ attempts: 4, first_pass_correct: 4 });
    const perItem = databaseRows<{ attempts: number }>(
      `SELECT count(*)::int AS attempts
         FROM study_attempts_v2 attempt
         JOIN study_session_items_v2 item ON item.session_item_id=attempt.session_item_id
         JOIN study_sessions_v2 session ON session.session_id=item.session_id
        WHERE session.account_id='${account.accountId}'
        GROUP BY item.ordinal`,
    );
    expect(perItem.every((row) => row.attempts === 1)).toBe(true);
    expect(studyQualifications(account.accountId)[0]?.count).toBe(1);
  });

  test("denied microphone shows the failure and persists no attempt", async ({ context, page }) => {
    const account = await useAccount(context, manifest, 4);
    await page.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: () => Promise.reject(new DOMException("Permission denied", "NotAllowedError")),
      });
    });
    await startStudyLesson(page);
    await page.getByRole("button", { name: "Record", exact: true }).click();
    const disclosure = page.locator("[data-study-mic-disclosure]");
    if (await disclosure.isVisible().catch(() => false)) {
      await page.locator("[data-study-mic-disclosure-accept]").click();
    }
    await expect(page.getByText(/permission denied|not available in this browser/iu)).toBeVisible();
    expect(attemptSummary(account.accountId)[0]?.attempts).toBe(0);
  });
});
