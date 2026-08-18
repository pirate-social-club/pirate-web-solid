import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { chromium } from "playwright";

const DEFAULT_BASE_URL = "http://127.0.0.1:6006";
const DEFAULT_STORY_TIMEOUT_MS = 30_000;
const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_COUNT = 1;
const CHANNEL_EVENTS = [
  "storyFinished",
  "playFunctionThrewException",
  "unhandledErrorsWhilePlaying",
  "storyErrored",
  "storyThrewException",
];

/** @typedef {{ type: "story"; id: string; title?: string; name?: string; importPath?: string }} StoryEntry */

/**
 * @typedef {object} AxeResult
 * @property {"pass"|"fail"|"indeterminate"} status
 * @property {string|null} reason
 * @property {number|null} violations
 * @property {number|null} passes
 * @property {number|null} incomplete
 */

/**
 * @typedef {object} InteractionResult
 * @property {"pass"|"fail"|"indeterminate"} status
 * @property {string|null} reason
 */

/**
 * @typedef {object} StoryResult
 * @property {"story"} recordType
 * @property {string} id
 * @property {string|null} title
 * @property {string|null} importPath
 * @property {AxeResult} axe
 * @property {InteractionResult} interaction
 * @property {string|null} storyStatus
 * @property {number} elapsedMs
 * @property {object|null} panel
 * @property {{ storyFinished: object|null; events: Array<object> }} raw
 * @property {object|null} error
 */

function isRecord(value) {
  return value !== null && typeof value === "object";
}

function isAxeResult(value) {
  return isRecord(value)
    && Array.isArray(value.violations)
    && Array.isArray(value.passes)
    && Array.isArray(value.incomplete);
}

function isA11yReporter(value) {
  return isRecord(value) && value.type === "a11y";
}

function countOf(value, key) {
  return Array.isArray(value?.[key]) ? value[key].length : null;
}

function eventStoryId(event) {
  if (typeof event?.storyId === "string") return event.storyId;
  if (typeof event?.payload?.storyId === "string") return event.payload.storyId;
  return null;
}

function eventsForStory(events, storyId) {
  if (!storyId) return events;
  return events.filter((event) => eventStoryId(event) === storyId);
}

function hasEvent(events, name) {
  return events.some((event) => event?.name === name);
}

/**
 * Classifies the Storybook storyFinished payload without treating a panel
 * shell, a missing reporter, or malformed reporter data as a pass.
 *
 * @param {unknown} payload
 * @param {Array<{ name: string; storyId?: string|null; payload?: unknown }>} [events]
 * @param {string|null} [storyId]
 * @returns {{ axe: AxeResult; interaction: InteractionResult; storyStatus: string|null }}
 */
export function classifyStoryFinished(payload, events = [], storyId = null) {
  if (!isRecord(payload)) {
    return {
      axe: { status: "indeterminate", reason: "missing_story_finished_payload", violations: null, passes: null, incomplete: null },
      interaction: { status: "indeterminate", reason: "missing_story_finished_payload" },
      storyStatus: null,
    };
  }

  const storyEvents = eventsForStory(events, storyId);
  const reporters = Array.isArray(payload.reporters) ? payload.reporters : [];
  const a11yReporter = reporters.find(isA11yReporter);
  const a11yResult = a11yReporter?.result;
  const nonA11yFailure = reporters.some((reporter) => reporter?.type !== "a11y" && reporter?.status === "failed");
  const playFailure = hasEvent(storyEvents, "playFunctionThrewException") || hasEvent(storyEvents, "unhandledErrorsWhilePlaying");
  const renderFailure = hasEvent(storyEvents, "storyErrored") || hasEvent(storyEvents, "storyThrewException");

  /** @type {AxeResult} */
  let axe;
  if (!a11yReporter) {
    axe = { status: "indeterminate", reason: "missing_a11y_reporter", violations: null, passes: null, incomplete: null };
  } else if (isRecord(a11yResult) && "error" in a11yResult) {
    axe = { status: "indeterminate", reason: "a11y_reporter_error", violations: null, passes: null, incomplete: null };
  } else if (!isAxeResult(a11yResult)) {
    axe = { status: "indeterminate", reason: "malformed_a11y_result", violations: null, passes: null, incomplete: null };
  } else {
    const violations = countOf(a11yResult, "violations");
    const passes = countOf(a11yResult, "passes");
    const incomplete = countOf(a11yResult, "incomplete");
    axe = {
      status: violations > 0 ? "fail" : "pass",
      reason: violations > 0 ? "axe_violations" : null,
      violations,
      passes,
      incomplete,
    };
  }

  /** @type {InteractionResult} */
  let interaction;
  if (playFailure) {
    interaction = { status: "fail", reason: "play_function_failure" };
  } else if (nonA11yFailure || renderFailure) {
    interaction = { status: "fail", reason: nonA11yFailure ? "non_a11y_reporter_failure" : "story_render_error" };
  } else if (payload.status === "success" || (payload.status === "error" && a11yReporter)) {
    // An axe violation changes storyFinished.status to error. It does not mean
    // the story's play function failed when the a11y reporter is the only
    // failed reporter.
    interaction = { status: "pass", reason: null };
  } else {
    interaction = { status: "indeterminate", reason: "unknown_story_finished_status" };
  }

  return { axe, interaction, storyStatus: typeof payload.status === "string" ? payload.status : null };
}

/**
 * @param {unknown} payload
 * @returns {{ axe: AxeResult; interaction: InteractionResult; storyStatus: null }}
 */
export function classifyStoryTimeout(payload = undefined) {
  return {
    axe: { status: "indeterminate", reason: "story_finished_timeout", violations: null, passes: null, incomplete: null },
    interaction: { status: "indeterminate", reason: "story_finished_timeout" },
    storyStatus: payload === undefined ? null : "timeout",
  };
}

/**
 * Storybook's manager creates this channel before the preview is navigated.
 * Installing the setter in an init script means the listener is present before
 * Storybook can emit storyFinished, including for very fast stories.
 */
const CHANNEL_INIT_SCRIPT = ({ eventNames }) => {
  const path = new URL(globalThis.location.href).searchParams.get("path") ?? "";
  const activeStoryId = path.startsWith("/story/") ? decodeURIComponent(path.slice("/story/".length)) : null;
  const state = { channelReady: false, activeStoryId, events: [] };
  Object.defineProperty(globalThis, "__STORYBOOK_A11Y_SWEEP__", {
    configurable: true,
    value: state,
  });

  let channel;
  const attach = (candidate) => {
    channel = candidate;
    if (!candidate || typeof candidate.on !== "function") return;
    state.channelReady = true;
    for (const name of eventNames) {
      candidate.on(name, (payload) => {
        state.events.push({
          name,
          payload,
          storyId: typeof payload?.storyId === "string" ? payload.storyId : state.activeStoryId,
          at: Date.now(),
        });
      });
    }
  };

  Object.defineProperty(globalThis, "__STORYBOOK_ADDONS_CHANNEL__", {
    configurable: true,
    get: () => channel,
    set: attach,
  });

  state.beginStory = (storyId) => {
    state.channelReady = Boolean(channel);
    state.activeStoryId = storyId;
    state.events = [];
  };
};

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    storyIds: [],
    filter: null,
    ledgerPath: null,
    summaryPath: null,
    storyTimeoutMs: DEFAULT_STORY_TIMEOUT_MS,
    startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
    retryCount: DEFAULT_RETRY_COUNT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    const [name, inlineValue] = arg.split("=", 2);
    const nextValue = () => inlineValue ?? argv[++index];
    switch (name) {
      case "--base-url": options.baseUrl = nextValue(); break;
      case "--story-id": options.storyIds.push(nextValue()); break;
      case "--filter": options.filter = nextValue(); break;
      case "--ledger": options.ledgerPath = nextValue(); break;
      case "--summary": options.summaryPath = nextValue(); break;
      case "--story-timeout-ms": options.storyTimeoutMs = Number(nextValue()); break;
      case "--startup-timeout-ms": options.startupTimeoutMs = Number(nextValue()); break;
      case "--retry-count": options.retryCount = Number(nextValue()); break;
      default: throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isFinite(options.storyTimeoutMs) || options.storyTimeoutMs < 1) throw new Error("--story-timeout-ms must be positive");
  if (!Number.isFinite(options.startupTimeoutMs) || options.startupTimeoutMs < 1) throw new Error("--startup-timeout-ms must be positive");
  if (!Number.isInteger(options.retryCount) || options.retryCount < 0 || options.retryCount > 1) throw new Error("--retry-count must be 0 or 1");
  return options;
}

/** @param {unknown} value @returns {StoryEntry[]} */
export function parseStoryIndex(value) {
  if (!isRecord(value) || !isRecord(value.entries)) throw new Error("Storybook /index.json is missing entries");
  return Object.values(value.entries)
    .filter((entry) => isRecord(entry) && entry.type === "story" && typeof entry.id === "string")
    .map((entry) => ({
      type: "story",
      id: entry.id,
      title: typeof entry.title === "string" ? entry.title : undefined,
      name: typeof entry.name === "string" ? entry.name : undefined,
      importPath: typeof entry.importPath === "string" ? entry.importPath : undefined,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function matchesSelection(entry, options) {
  const requested = new Set(options.storyIds.flatMap((id) => id.split(",").map((part) => part.trim()).filter(Boolean)));
  if (requested.size > 0 && !requested.has(entry.id)) return false;
  if (options.filter) {
    const matcher = new RegExp(options.filter, "i");
    return matcher.test(entry.id) || matcher.test(entry.importPath ?? "") || matcher.test(entry.title ?? "");
  }
  return true;
}

async function fetchIndex(baseUrl, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL("/index.json", `${baseUrl}/`), { signal: controller.signal });
    if (!response.ok) throw new Error(`Storybook index returned HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function storyUrl(baseUrl, id) {
  const url = new URL("/", `${baseUrl}/`);
  url.searchParams.set("path", `/story/${id}`);
  url.searchParams.set("addonPanel", "storybook/a11y/panel");
  return url.toString();
}

async function waitForStoryFinished(page, storyId, timeoutMs) {
  try {
    await page.waitForFunction(
      (id) => globalThis.__STORYBOOK_A11Y_SWEEP__?.channelReady === true && globalThis.__STORYBOOK_A11Y_SWEEP__.events.some((event) => event.name === "storyFinished" && event.storyId === id && event.payload?.storyId === id),
      storyId,
      { timeout: timeoutMs },
    );
  } catch (error) {
    error.channelEvents = await page.evaluate((id) => {
      const state = globalThis.__STORYBOOK_A11Y_SWEEP__;
      return state?.events?.filter((event) => event.storyId === id) ?? [];
    }, storyId).catch(() => []);
    throw error;
  }
  return page.evaluate((id) => {
    const state = globalThis.__STORYBOOK_A11Y_SWEEP__;
    const matching = state.events.filter((event) => event.name === "storyFinished" && event.storyId === id && event.payload?.storyId === id);
    const finish = matching.at(-1);
    return { payload: finish?.payload ?? null, events: state.events.filter((event) => event.storyId === id) };
  }, storyId);
}

async function panelEvidence(page) {
  const text = await page.locator("#storybook-panel-root").innerText().catch(() => "");
  return {
    hasViolationCount: /Violations\d+/.test(text),
    hasPassCount: /Passes\d+/.test(text),
    hasIncompleteCount: /Inconclusive\d+/.test(text),
    bare: !(/Violations\d+/.test(text) && /Passes\d+/.test(text) && /Inconclusive\d+/.test(text)),
  };
}

async function runOnce(options, attempt) {
  const indexValue = await fetchIndex(options.baseUrl, options.startupTimeoutMs);
  const catalog = parseStoryIndex(indexValue);
  const stories = catalog.filter((entry) => matchesSelection(entry, options));
  if (stories.length === 0) throw new Error("Story selection matched no live Storybook stories");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(options.storyTimeoutMs);
  page.setDefaultNavigationTimeout(options.storyTimeoutMs);
  await page.addInitScript(CHANNEL_INIT_SCRIPT, { eventNames: CHANNEL_EVENTS });

  /** @type {StoryResult[]} */
  const results = [];
  try {
    for (const story of stories) {
      const startedAt = Date.now();
      let payload = null;
      let events = [];
      let error = null;
      try {
        // A page can retain the manager channel across a same-document story
        // change. Clear prior events so a previous play failure cannot poison
        // the next story's independent interaction result.
        await page.evaluate((storyId) => globalThis.__STORYBOOK_A11Y_SWEEP__?.beginStory?.(storyId), story.id);
        await page.goto(storyUrl(options.baseUrl, story.id), { waitUntil: "domcontentloaded" });
        ({ payload, events } = await waitForStoryFinished(page, story.id, options.storyTimeoutMs));
      } catch (caught) {
        error = { name: caught?.name ?? "Error", message: String(caught?.message ?? caught) };
        events = Array.isArray(caught?.channelEvents) ? caught.channelEvents : [];
      }

      const classified = error
        ? classifyStoryTimeout()
        : classifyStoryFinished(payload, events, story.id);
      const panel = await panelEvidence(page).catch(() => ({ hasViolationCount: false, hasPassCount: false, hasIncompleteCount: false, bare: true }));
      results.push({
        recordType: "story",
        id: story.id,
        title: story.title ?? null,
        importPath: story.importPath ?? null,
        axe: classified.axe,
        interaction: classified.interaction,
        storyStatus: classified.storyStatus,
        elapsedMs: Date.now() - startedAt,
        panel,
        raw: { storyFinished: payload, events },
        error,
      });
    }
  } finally {
    await browser.close();
  }

  return {
    recordType: "run",
    runId: `storybook-a11y-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    attempt,
    baseUrl: options.baseUrl,
    indexVersion: isRecord(indexValue) && typeof indexValue.v === "number" ? indexValue.v : null,
    catalogStoryCount: catalog.length,
    catalogFileCount: new Set(catalog.map((entry) => entry.importPath).filter(Boolean)).size,
    selectedStoryCount: stories.length,
    selectedFileCount: new Set(stories.map((entry) => entry.importPath).filter(Boolean)).size,
    startedAt: options.sweepStartedAt ?? new Date().toISOString(),
    results,
  };
}

export function isRetryableStartupError(error) {
  const message = String(error?.message ?? error);
  if (/story_finished_timeout/i.test(message)) return false;
  return /ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|fetch failed|failed to fetch|abort(?:ed)?|Storybook index|browser|Target page|launch|timeout/i.test(message);
}

export function summarize(run) {
  const results = run.results ?? [];
  const count = (predicate) => results.filter(predicate).length;
  const axePass = count((result) => result.axe.status === "pass");
  const axeFail = count((result) => result.axe.status === "fail");
  const axeIndeterminate = count((result) => result.axe.status === "indeterminate");
  const interactionPass = count((result) => result.interaction.status === "pass");
  const interactionFail = count((result) => result.interaction.status === "fail");
  const interactionIndeterminate = count((result) => result.interaction.status === "indeterminate");
  const incomplete = results.reduce((total, result) => total + (result.axe.incomplete ?? 0), 0);
  const failures = results.filter((result) => result.axe.status !== "pass" || result.interaction.status !== "pass");
  const exitCode = run.startupError || axeFail > 0 || axeIndeterminate > 0 || interactionFail > 0 || interactionIndeterminate > 0 ? 1 : 0;
  const lines = [
    "Storybook axe/interaction sweep",
    `Base URL: ${run.baseUrl}`,
    `Catalog: ${run.catalogFileCount} files / ${run.catalogStoryCount} stories; selected ${run.selectedFileCount} files / ${run.selectedStoryCount} stories`,
    `Axe: ${axePass} pass, ${axeFail} violation-fail, ${axeIndeterminate} indeterminate`,
    `Axe incomplete checks: ${incomplete} (reported separately; not violations or indeterminate)`,
    `Interactions: ${interactionPass} pass, ${interactionFail} fail, ${interactionIndeterminate} indeterminate`,
    `Panel evidence: ${count((result) => result.panel?.bare)} bare/no-counter result(s) (diagnostic only; never a pass)`,
    `Exit: ${exitCode === 0 ? "PASS" : "FAIL"}`,
  ];
  if (run.startupError) lines.push(`Startup error: ${run.startupError.name}: ${run.startupError.message}`);
  if (failures.length > 0) {
    lines.push("Failures:");
    for (const result of failures) {
      lines.push(`- ${result.id}: axe=${result.axe.status}${result.axe.reason ? `(${result.axe.reason})` : ""}, interaction=${result.interaction.status}${result.interaction.reason ? `(${result.interaction.reason})` : ""}`);
    }
  }
  return { exitCode, text: `${lines.join("\n")}\n` };
}

async function writeOutputs(run, options, summary) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ledgerPath = resolve(options.ledgerPath ?? `.tmp/storybook-a11y/ledger-${stamp}.jsonl`);
  const summaryPath = resolve(options.summaryPath ?? `.tmp/storybook-a11y/summary-${stamp}.txt`);
  await mkdir(dirname(ledgerPath), { recursive: true });
  await mkdir(dirname(summaryPath), { recursive: true });
  const records = [
    { ...run, finishedAt: new Date().toISOString(), exitCode: summary.exitCode },
    ...(run.results ?? []),
  ];
  await writeFile(ledgerPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
  await writeFile(summaryPath, summary.text, "utf8");
  return { ledgerPath, summaryPath };
}

export { writeOutputs };

function helpText() {
  return `Usage: node scripts/storybook-a11y-sweep.mjs [options]

Options:
  --base-url URL              Live Storybook URL (default: ${DEFAULT_BASE_URL})
  --story-id ID[,ID]          Target specific story IDs; repeatable
  --filter REGEX              Target IDs, titles, or import paths matching REGEX
  --ledger PATH               JSONL ledger path (default: .tmp/storybook-a11y/ledger-*.jsonl)
  --summary PATH              Human summary path (default: .tmp/storybook-a11y/summary-*.txt)
  --story-timeout-ms N        Per-story timeout (default: ${DEFAULT_STORY_TIMEOUT_MS})
  --startup-timeout-ms N      Live index timeout (default: ${DEFAULT_STARTUP_TIMEOUT_MS})
  --retry-count 0|1           Browser/startup retry only (default: ${DEFAULT_RETRY_COUNT})
  --help                      Show this help
`;
}

export async function runSweep(options, execute = runOnce) {
  const executionOptions = options.sweepStartedAt ? options : { ...options, sweepStartedAt: new Date().toISOString() };
  let lastError;
  for (let attempt = 0; attempt <= executionOptions.retryCount; attempt += 1) {
    try {
      return await execute(executionOptions, attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= executionOptions.retryCount || !isRetryableStartupError(error)) {
        if (isRecord(error)) error.attempt = attempt;
        throw error;
      }
    }
  }
  throw lastError;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    return 0;
  }

  options.sweepStartedAt = new Date().toISOString();
  let run;
  try {
    run = await runSweep(options);
  } catch (error) {
    run = {
      recordType: "run",
      runId: `storybook-a11y-startup-${new Date().toISOString().replace(/[:.]/g, "-")}`,
      attempt: Number.isInteger(error?.attempt) ? error.attempt : 0,
      baseUrl: options.baseUrl,
      catalogStoryCount: 0,
      catalogFileCount: 0,
      selectedStoryCount: 0,
      selectedFileCount: 0,
      startedAt: options.sweepStartedAt,
      results: [],
      startupError: { name: error?.name ?? "Error", message: String(error?.message ?? error) },
    };
  }

  const summary = summarize(run);
  const outputs = await writeOutputs(run, options, summary);
  process.stdout.write(`${summary.text}Ledger: ${outputs.ledgerPath}\nSummary: ${outputs.summaryPath}\n`);
  return run.startupError ? 1 : summary.exitCode;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? "")).href) {
  process.exitCode = await main();
}
