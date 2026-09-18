import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, type BrowserContext, type Page } from "playwright/test";
import { harnessManifestDefault } from "../paths.ts";

export interface HarnessAccount {
  readonly accountId: string;
  readonly personaId: string;
  readonly sessionToken: string;
}

export interface HarnessManifest {
  readonly accountId: string;
  readonly accounts: readonly HarnessAccount[];
  readonly appOrigin: string;
  readonly apiOrigin: string;
  readonly communityId: string;
  readonly csrfCookieName: string;
  readonly csrfToken: string;
  readonly negationLine: string;
  readonly personaId: string;
  readonly postId: string;
  readonly postSlug: string;
  readonly sessionCookieName: string;
  readonly sessionToken: string;
  readonly studyLines: readonly string[];
}

export function harnessManifest(): HarnessManifest {
  const path = process.env.STUDY_KARAOKE_HARNESS_MANIFEST?.trim() || harnessManifestDefault;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as HarnessManifest;
  } catch (error) {
    throw new Error(
      `Harness manifest not readable at ${path}. Run the api-next harness seed and set STUDY_KARAOKE_HARNESS_MANIFEST if needed. Cause: ${String(error)}`,
    );
  }
}

export function accountFor(manifest: HarnessManifest, index: number): HarnessAccount {
  const account = manifest.accounts[index];
  if (account === undefined) {
    throw new Error(`Harness manifest has no account at index ${index}`);
  }
  return account;
}

/** Injects the synthetic session and CSRF cookies for the rendered application. */
export async function useAccount(
  context: BrowserContext,
  manifest: HarnessManifest,
  index: number,
): Promise<HarnessAccount> {
  const account = accountFor(manifest, index);
  // `__Host-` cookies must be Secure; CDP rejects a Secure cookie added for an
  // http URL, so they are stored for the same host under https. Chromium treats
  // 127.0.0.1 as trustworthy and still sends them to the http development origin.
  const secureCookieOrigin = manifest.appOrigin.replace(/^http:/u, "https:");
  await context.addCookies([
    {
      name: manifest.sessionCookieName,
      value: account.sessionToken,
      url: secureCookieOrigin,
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: manifest.csrfCookieName,
      value: manifest.csrfToken,
      url: secureCookieOrigin,
      secure: true,
      sameSite: "Lax",
    },
  ]);
  return account;
}

async function harnessPost(
  manifest: HarnessManifest,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${manifest.apiOrigin}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`harness control ${path} failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

export async function armStudyTranscript(
  manifest: HarnessManifest,
  script: {
    readonly transcript: string;
    readonly failure?: string;
  },
): Promise<void> {
  await harnessPost(manifest, "/__harness__/study/arm", { script });
}

export async function resetStudyScripts(manifest: HarnessManifest): Promise<void> {
  await harnessPost(manifest, "/__harness__/study/arm", { reset: true });
}

/**
 * Harness-local document CSP adjustment for the Karaoke WebSocket.
 *
 * The application's document policy lists `connect-src 'self'` and the media
 * providers, but not the api-next origin that `/karaoke/realtime` WebSocket
 * URLs point at, so the scored-take socket is blocked in a real browser. The
 * harness strips the document policy header for its local journeys and reports
 * the omission as a finding; it does not change application behaviour.
 */
export async function relaxDocumentCspForHarness(page: Page): Promise<void> {
  const relax = async (route: import("playwright/test").Route): Promise<void> => {
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const headers = { ...response.headers() };
    delete headers["content-security-policy"];
    await route.fulfill({ response, headers });
    // Stop intercepting after the document so playback, capture and the
    // WebSocket run on the untouched network path.
    await page.unroute("**/*", relax);
  };
  await page.route("**/*", relax);
}

export async function armKaraokeMode(
  manifest: HarnessManifest,
  sessionId: string,
  mode: string,
): Promise<void> {
  await harnessPost(manifest, "/__harness__/karaoke/arm", { sessionId, mode });
}

export async function karaokeSttState(
  manifest: HarnessManifest,
  sessionId: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${manifest.apiOrigin}/__harness__/karaoke/state?sessionId=${encodeURIComponent(sessionId)}`,
  );
  if (!response.ok) throw new Error(`harness karaoke state failed: ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

const databaseContainer = process.env.HARNESS_PG_CONTAINER?.trim() || "study-karaoke-harness-pg17";

/**
 * Operator-path row reads: the disposable harness PostgreSQL is queried through
 * psql in its container. This is deliberately not an application code path, so
 * assertions test persisted rows rather than an API projection.
 */
export function databaseRows<T>(sql: string): T[] {
  const output = execFileSync(
    "docker",
    [
      "exec",
      databaseContainer,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-tAc",
      `SET search_path=api_next; SELECT coalesce(json_agg(row_to_json(rows))::text, '[]') FROM (${sql}) AS rows`,
    ],
    { encoding: "utf8" },
  ).trim();
  const lastLine = output.split("\n").at(-1)?.trim() ?? "[]";
  return JSON.parse(lastLine) as T[];
}

export async function waitForDatabaseRow<T>(
  sql: string,
  predicate: (rows: T[]) => boolean,
  timeoutMs = 30_000,
): Promise<T[]> {
  const deadline = Date.now() + timeoutMs;
  let rows: T[] = [];
  while (Date.now() < deadline) {
    rows = databaseRows<T>(sql);
    if (predicate(rows)) return rows;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for database rows. Last rows: ${JSON.stringify(rows)}`);
}

/** The say-it-back card prompt is the only h2 rendered in the lesson surface. */
export async function currentStudyPrompt(page: Page): Promise<string> {
  const heading = page.locator("main h2").first();
  await expect(heading).toBeVisible();
  return (await heading.innerText()).trim();
}

export type StudyLessonAction = "record" | "continue" | "complete";

/**
 * Waits for the lesson to reach an actionable state. The surface is a server
 * state machine: after a graded attempt it shows either the next card
 * (Record), a spent-miss reveal (Continue), or completion.
 */
export async function waitForStudyLessonAction(
  page: Page,
  timeoutMs = 120_000,
): Promise<StudyLessonAction> {
  const completeText = page.getByText("Session complete", { exact: true });
  const recordButton = page.getByRole("button", { name: "Record", exact: true });
  const continueButton = page.getByRole("button", { name: "Continue", exact: true });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await completeText.isVisible().catch(() => false)) return "complete";
    if (await continueButton.isVisible().catch(() => false)) return "continue";
    if (await recordButton.isVisible().catch(() => false)) return "record";
    await page.waitForTimeout(250);
  }
  throw new Error("Study lesson did not reach an actionable state");
}

/** Records one answer for the current card and waits for it to be graded. */
export async function answerStudyCardThroughUi(
  page: Page,
  manifest: HarnessManifest,
  transcript: string,
): Promise<StudyLessonAction> {
  const recordButton = page.getByRole("button", { name: "Record", exact: true });
  await expect(recordButton).toBeEnabled();
  await recordButton.click();
  const disclosure = page.locator("[data-study-mic-disclosure]");
  if (await disclosure.isVisible().catch(() => false)) {
    await page.locator("[data-study-mic-disclosure-accept]").click();
  }
  const stopButton = page.getByRole("button", { name: "Stop", exact: true });
  await expect(stopButton).toBeVisible();
  await armStudyTranscript(manifest, { transcript });
  await page.waitForTimeout(1_200);
  await stopButton.click();
  return waitForStudyLessonAction(page);
}

export async function completeStudySessionThroughUi(
  page: Page,
  manifest: HarnessManifest,
): Promise<void> {
  for (let card = 0; card < 12; card += 1) {
    const action = await waitForStudyLessonAction(page);
    if (action === "complete") return;
    if (action === "continue") {
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      continue;
    }
    const reference = await currentStudyPrompt(page);
    await answerStudyCardThroughUi(page, manifest, reference);
  }
  if ((await waitForStudyLessonAction(page, 5_000)) === "complete") return;
  throw new Error("Study lesson did not reach completion within the card budget");
}
