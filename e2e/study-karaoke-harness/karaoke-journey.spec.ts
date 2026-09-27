import { expect, test } from "playwright/test";
import {
  armKaraokeMode,
  assertBuiltWorkletArtifact,
  databaseRows,
  expectedApiSocketOrigin,
  harnessManifest,
  type HarnessManifest,
  useAccount,
  waitForDatabaseRow,
} from "./fixtures/harness.ts";

/**
 * Real Solid UI Karaoke journeys against the local harness Worker, the real
 * Karaoke Durable Object and a disposable PostgreSQL. Only the streaming STT
 * provider is scripted (armed per attempt); the socket protocol, session
 * lifecycle, scoring, persistence and finalization are real.
 *
 * The instrumental is served by the Solid dev server at /harness/instrumental.wav,
 * so playback drives song time exactly as in production.
 */
let manifest: HarnessManifest;

// Read the manifest in a hook, not at module load: Playwright's `--list`
// discovery loads the spec files on checkouts that have no local harness
// manifest, and a top-level read would fail the discovery gate there.
test.beforeAll(() => {
  manifest = harnessManifest();
});

interface KaraokeAttemptRow {
  readonly attempt_id: string;
  readonly completion_reason: string;
  readonly final_score_bps: number;
  readonly lyrics_score_bps: number;
  readonly timing_score_bps: number | null;
  readonly scored_line_count: number;
  readonly no_recognition_line_count: number;
  readonly low_confidence_line_count: number;
  readonly qualifications: number;
  readonly raw_offset_ms: number | null;
  readonly timing_state: string | null;
}

function attemptRows(sessionId: string): KaraokeAttemptRow[] {
  return databaseRows<KaraokeAttemptRow>(
    `SELECT attempt.attempt_id, attempt.completion_reason, attempt.final_score_bps,
            attempt.lyrics_score_bps, attempt.timing_score_bps,
            attempt.scored_line_count, attempt.no_recognition_line_count,
            attempt.low_confidence_line_count,
            coalesce(attempt.scoring_diagnostics->'timing_calibration'->>'raw_offset_ms', 'null')::int AS raw_offset_ms,
            attempt.scoring_diagnostics->'timing_calibration'->>'state' AS timing_state,
            (SELECT count(*)::int FROM activity_qualifications qualification
              WHERE qualification.karaoke_attempt_id=attempt.attempt_id) AS qualifications
       FROM karaoke_attempts attempt
      WHERE attempt.session_id='${sessionId}'`,
  );
}

async function startScoredTake(page: import("playwright/test").Page): Promise<string> {
  await assertBuiltWorkletArtifact(page.context().request);
  const sessionResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && response.url().includes("/karaoke/attempts"),
    { timeout: 90_000 },
  );
  const documentResponse = await page.goto(`/posts/${manifest.postSlug}/karaoke`);
  expect(documentResponse).not.toBeNull();
  const policy = documentResponse?.headers()["content-security-policy"];
  expect(policy, "the karaoke document must carry an enforcing CSP header").toBeDefined();
  expect(policy).toContain(expectedApiSocketOrigin(manifest));
  expect(policy).not.toContain("connect-src *");

  const start = page.getByRole("button", { name: "Start karaoke", exact: true });
  await expect(start).toBeVisible({ timeout: 30_000 });
  const disclosure = page.locator("[data-karaoke-mic-disclosure]");
  const acceptDisclosureIfOpen = async (): Promise<void> => {
    const open = await disclosure
      .waitFor({ state: "visible", timeout: 2_000 })
      .then(() => true)
      .catch(() => false);
    if (open) await page.locator("[data-karaoke-mic-disclosure-accept]").click();
  };
  // The route loads community personas asynchronously and the first-use
  // disclosure opens before the session is created; retry the start until the
  // session request actually begins.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await start.isVisible().catch(() => false)) await start.click();
    await acceptDisclosureIfOpen();
    const response = await Promise.race([
      sessionResponse.then((value) => value),
      page.waitForTimeout(1_500).then(() => null),
    ]);
    if (response !== null) {
      expect(response.ok()).toBe(true);
      const session = (await response.json()) as { readonly id: string };
      return session.id;
    }
  }
  throw new Error("Karaoke scored take never created a session");
}

async function waitForTakeEnd(page: import("playwright/test").Page): Promise<void> {
  await expect(page.getByRole("button", { name: "Sing again", exact: true })).toBeVisible({
    timeout: 60_000,
  });
}

test.describe("local Karaoke journey", () => {
  test("a scored take persists line scores, final score and one completion effect", async ({
    context,
    page,
  }) => {
    const account = await useAccount(context, manifest, 6);
    // Record stage presentation in the page itself: polling the DOM through
    // CDP during playback blocks the main thread and stalls song-time reports.
    await page.addInitScript(() => {
      const harness = window as typeof window & {
        __harnessStage: { lines: string[]; tokenStates: string[]; audio: string[] };
      };
      harness.__harnessStage = { lines: [], tokenStates: [], audio: [] };
      setInterval(() => {
        const active = document.querySelector(".karaoke-line-active");
        const text = active?.getAttribute("aria-label")?.trim() ?? null;
        if (text !== null && harness.__harnessStage.lines.at(-1) !== text) {
          harness.__harnessStage.lines.push(text);
        }
        const states = [...document.querySelectorAll("[data-token-state]")].map(
          (node) => node.getAttribute("data-token-state") ?? "missing",
        );
        if (states.length > 0) {
          harness.__harnessStage.tokenStates.push(states.join(","));
        }
        const audio = document.querySelector("audio");
        if (audio !== null) {
          harness.__harnessStage.audio.push(`${audio.currentTime.toFixed(1)}:${audio.paused ? "p" : "r"}`);
        }
      }, 200);
    });
    const sessionId = await startScoredTake(page);
    await armKaraokeMode(manifest, sessionId, "correct");
    await waitForTakeEnd(page);

    const stage = await page.evaluate(
      () =>
        (window as typeof window & {
          __harnessStage: { lines: string[]; tokenStates: string[]; audio: string[] };
        }).__harnessStage,
    );
    const lineHighlights = [...new Set(stage.lines)];
    const tokenStates = new Set(stage.tokenStates.flatMap((entry) => entry.split(",")));

    const rows = await waitForDatabaseRow<KaraokeAttemptRow>(
      `SELECT attempt.attempt_id, attempt.completion_reason, attempt.final_score_bps,
              attempt.lyrics_score_bps, attempt.timing_score_bps,
              attempt.scored_line_count, attempt.no_recognition_line_count,
              attempt.low_confidence_line_count,
              coalesce(attempt.scoring_diagnostics->'timing_calibration'->>'raw_offset_ms', 'null')::int AS raw_offset_ms,
              attempt.scoring_diagnostics->'timing_calibration'->>'state' AS timing_state,
              (SELECT count(*)::int FROM activity_qualifications qualification
                WHERE qualification.karaoke_attempt_id=attempt.attempt_id) AS qualifications
         FROM karaoke_attempts attempt
        WHERE attempt.session_id='${sessionId}'`,
      (all) => all.length === 1,
    );
    const attempt = rows[0];
    expect(attempt?.completion_reason).toBe("completed");
    expect(attempt?.scored_line_count).toBe(5);
    expect(attempt?.no_recognition_line_count).toBe(0);
    expect(attempt?.final_score_bps ?? 0).toBeGreaterThan(8_000);
    expect(attempt?.qualifications).toBe(1);
    expect(attempt?.attempt_id).toContain("karaoke_attempt_");
    expect(rows).toHaveLength(1);

    console.log(
      `[findings] correct take: line highlights=${JSON.stringify(lineHighlights)} token states=${JSON.stringify([...tokenStates])} final=${attempt?.final_score_bps} lyrics=${attempt?.lyrics_score_bps} timing=${attempt?.timing_score_bps} calibration=${attempt?.timing_state}/${attempt?.raw_offset_ms}`,
    );
    expect(lineHighlights.length).toBeGreaterThan(0);
    expect([...tokenStates].some((state) => state === "active" || state === "complete")).toBe(true);
    void account;
  });

  test("wrong words produce a persisted low score with no completion duplication", async ({
    context,
    page,
  }) => {
    await useAccount(context, manifest, 7);
    const sessionId = await startScoredTake(page);
    await armKaraokeMode(manifest, sessionId, "wrong_words");
    await waitForTakeEnd(page);
    const rows = await waitForDatabaseRow<KaraokeAttemptRow>(
      `SELECT attempt.attempt_id, attempt.completion_reason, attempt.final_score_bps,
              attempt.lyrics_score_bps, attempt.timing_score_bps,
              attempt.scored_line_count, attempt.no_recognition_line_count,
              attempt.low_confidence_line_count,
              coalesce(attempt.scoring_diagnostics->'timing_calibration'->>'raw_offset_ms', 'null')::int AS raw_offset_ms,
              attempt.scoring_diagnostics->'timing_calibration'->>'state' AS timing_state,
              (SELECT count(*)::int FROM activity_qualifications qualification
                WHERE qualification.karaoke_attempt_id=attempt.attempt_id) AS qualifications
         FROM karaoke_attempts attempt
        WHERE attempt.session_id='${sessionId}'`,
      (all) => all.length === 1,
    );
    const attempt = rows[0];
    expect(attempt?.completion_reason).toBe("completed");
    expect(attempt?.final_score_bps ?? 10_000).toBeLessThan(5_000);
    expect(attempt?.lyrics_score_bps ?? 10_000).toBeLessThan(5_000);
    expect(rows).toHaveLength(1);
    console.log(`[findings] wrong words: final=${attempt?.final_score_bps} lyrics=${attempt?.lyrics_score_bps} timing=${attempt?.timing_score_bps}`);
  });

  test("a silent take is persisted as unrecognized lines", { tag: "@silent-audio" }, async ({
    context,
    page,
  }) => {
    await useAccount(context, manifest, 8);
    const sessionId = await startScoredTake(page);
    await armKaraokeMode(manifest, sessionId, "silence");
    await waitForTakeEnd(page);
    const rows = await waitForDatabaseRow<KaraokeAttemptRow>(
      `SELECT attempt.attempt_id, attempt.completion_reason, attempt.final_score_bps,
              attempt.lyrics_score_bps, attempt.timing_score_bps,
              attempt.scored_line_count, attempt.no_recognition_line_count,
              attempt.low_confidence_line_count,
              coalesce(attempt.scoring_diagnostics->'timing_calibration'->>'raw_offset_ms', 'null')::int AS raw_offset_ms,
              attempt.scoring_diagnostics->'timing_calibration'->>'state' AS timing_state,
              (SELECT count(*)::int FROM activity_qualifications qualification
                WHERE qualification.karaoke_attempt_id=attempt.attempt_id) AS qualifications
         FROM karaoke_attempts attempt
        WHERE attempt.session_id='${sessionId}'`,
      (all) => all.length === 1,
    );
    const attempt = rows[0];
    expect(attempt?.completion_reason).toBe("completed");
    expect(attempt?.no_recognition_line_count).toBe(5);
    expect(attempt?.scored_line_count).toBe(0);
    expect(attempt?.final_score_bps ?? 10_000).toBeLessThan(1_000);
    console.log(`[findings] silent take: noRecognition=${attempt?.no_recognition_line_count} final=${attempt?.final_score_bps} qualifications=${attempt?.qualifications}`);
  });

  test("early delivery is reflected in the persisted timing diagnostics", async ({
    context,
    page,
  }) => {
    await useAccount(context, manifest, 9);
    const sessionId = await startScoredTake(page);
    await armKaraokeMode(manifest, sessionId, "early");
    await waitForTakeEnd(page);
    const rows = await waitForDatabaseRow<KaraokeAttemptRow>(
      `SELECT attempt.attempt_id, attempt.completion_reason, attempt.final_score_bps,
              attempt.lyrics_score_bps, attempt.timing_score_bps,
              attempt.scored_line_count, attempt.no_recognition_line_count,
              attempt.low_confidence_line_count,
              coalesce(attempt.scoring_diagnostics->'timing_calibration'->>'raw_offset_ms', 'null')::int AS raw_offset_ms,
              attempt.scoring_diagnostics->'timing_calibration'->>'state' AS timing_state,
              (SELECT count(*)::int FROM activity_qualifications qualification
                WHERE qualification.karaoke_attempt_id=attempt.attempt_id) AS qualifications
         FROM karaoke_attempts attempt
        WHERE attempt.session_id='${sessionId}'`,
      (all) => all.length === 1,
    );
    const attempt = rows[0];
    expect(attempt?.completion_reason).toBe("completed");
    expect(attempt?.raw_offset_ms ?? 0).toBeLessThanOrEqual(-100);
    console.log(`[findings] early delivery: raw_offset=${attempt?.raw_offset_ms} timing=${attempt?.timing_score_bps} final=${attempt?.final_score_bps} calibration=${attempt?.timing_state}`);
  });

  test("late delivery is reflected in the persisted timing diagnostics", async ({
    context,
    page,
  }) => {
    await useAccount(context, manifest, 10);
    const sessionId = await startScoredTake(page);
    await armKaraokeMode(manifest, sessionId, "late");
    await waitForTakeEnd(page);
    const rows = await waitForDatabaseRow<KaraokeAttemptRow>(
      `SELECT attempt.attempt_id, attempt.completion_reason, attempt.final_score_bps,
              attempt.lyrics_score_bps, attempt.timing_score_bps,
              attempt.scored_line_count, attempt.no_recognition_line_count,
              attempt.low_confidence_line_count,
              coalesce(attempt.scoring_diagnostics->'timing_calibration'->>'raw_offset_ms', 'null')::int AS raw_offset_ms,
              attempt.scoring_diagnostics->'timing_calibration'->>'state' AS timing_state,
              (SELECT count(*)::int FROM activity_qualifications qualification
                WHERE qualification.karaoke_attempt_id=attempt.attempt_id) AS qualifications
         FROM karaoke_attempts attempt
        WHERE attempt.session_id='${sessionId}'`,
      (all) => all.length === 1,
    );
    const attempt = rows[0];
    expect(attempt?.completion_reason).toBe("completed");
    expect(attempt?.raw_offset_ms ?? 0).toBeGreaterThanOrEqual(100);
    console.log(`[findings] late delivery: raw_offset=${attempt?.raw_offset_ms} timing=${attempt?.timing_score_bps} final=${attempt?.final_score_bps} calibration=${attempt?.timing_state}`);
  });

  test("a mid-take disconnect persists no duplicate completion effect", async ({
    context,
    page,
  }) => {
    const account = await useAccount(context, manifest, 11);
    const sessionId = await startScoredTake(page);
    await armKaraokeMode(manifest, sessionId, "correct");
    await expect(page.locator(".karaoke-line-active").first()).toBeVisible({ timeout: 30_000 });
    await context.setOffline(true);
    await page.waitForTimeout(4_000);
    await context.setOffline(false);
    await page.waitForTimeout(6_000);

    const sessions = databaseRows<{ session_id: string }>(
      `SELECT session_id FROM karaoke_sessions WHERE session_id='${sessionId}'`,
    );
    expect(sessions).toHaveLength(1);
    const rows = attemptRows(sessionId);
    expect(rows.length).toBeLessThanOrEqual(1);
    const qualifications = databaseRows<{ count: number }>(
      `SELECT count(*)::int AS count FROM activity_qualifications
        WHERE account_id='${account.accountId}' AND activity_key='karaoke'`,
    );
    expect(qualifications[0]?.count ?? 0).toBeLessThanOrEqual(1);
    console.log(
      `[findings] disconnect: attempts=${rows.length} completion=${rows[0]?.completion_reason ?? "none"}`,
    );
  });
});
