// Song posting through an ordinary browser, on the real community page.
//
// The text harness proves conversation posting end to end; this is its song
// equivalent. It drives the page's own Post here action, the four designed
// steps, and the production media submission coordinator against a fixture
// API, and it insists the song publishes exactly once.
//
// It is a local gate. Staging acceptance with Privy is separate and is the
// only thing that proves the deployed pair.

import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { chromium } from "playwright";

const apiPort = 8791;
const solidPort = 4184;
const solidOrigin = `http://127.0.0.1:${solidPort}`;
const apiOrigin = `http://127.0.0.1:${apiPort}`;

const communityIds = {
  "with-lyrics": "community_123e4567-e89b-42d3-a456-426614174011",
  instrumental: "community_123e4567-e89b-42d3-a456-426614174012",
};
const communitiesById = new Map(Object.entries(communityIds).map(([name, id]) => [id, name]));

/** Every media call the browser made, in order, for the assertions at the end. */
const mediaCalls = [];
const uploads = [];
const submissions = new Map();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", chunk => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function userFixture() {
  const unverified = { state: "unverified" };
  return {
    id: "user-song-e2e",
    object: "user",
    verification_state: "unverified",
    verification_capabilities: {
      unique_human: unverified,
      age_over_18: unverified,
      minimum_age: unverified,
      nationality: unverified,
      gender: unverified,
      wallet_score: unverified,
    },
    created: 1_777_000_000,
  };
}

function personasFixture() {
  return {
    personas: Object.entries(communityIds).map(([name, communityId]) => ({
      persona_id: `persona-song-${name}`,
      object: "persona",
      status: "active",
      profile: {
        persona_id: `persona-song-${name}`,
        object: "persona_profile",
        revision: 1,
        display_name: "Song fixture persona",
        avatar_ref: null,
        cover_ref: null,
        bio: null,
        preferred_locale: null,
        primary_public_handle: "song-fixture",
      },
      wallet_set: { evm: null },
      community_binding: { community_id: communityId, binding_source: "first_membership" },
      created_at: "2026-08-26T00:00:00.000Z",
      retired_at: null,
    })),
  };
}

function communityRouteFixture(communityId) {
  return {
    authority_version: "optional_route_v2",
    community_id: communityId,
    href: `/c/${communityId}`,
    canonical_route: null,
    persona_role_presentation: {
      role: "owner",
      persona: {
        persona_id: `persona-song-${communitiesById.get(communityId)}`,
        object: "persona",
        display_name: "Song fixture persona",
        avatar_ref: null,
        primary_public_handle: "song-fixture",
      },
    },
  };
}

function communityPreviewFixture(communityId) {
  return {
    id: communityId,
    object: "community_preview",
    display_name: "Song fixture community",
    description: "Contextual song posting fixture.",
    membership_mode: "open",
    human_verification_lane: null,
    member_count: 1,
    follower_count: 1,
    viewer_membership_status: "member",
    viewer_following: true,
    moderators: [],
    membership_gate_summaries: [],
    rules: [],
    created: 1_777_000_000,
  };
}

function snapshotFor(record) {
  if (record.status === "published") {
    return {
      submission_id: record.submissionId,
      author_persona: {
        persona_id: record.personaId,
        object: "persona",
        display_name: "Song fixture persona",
        avatar_ref: null,
        primary_public_handle: "song-fixture",
      },
      href: `/media-post-submissions/${record.submissionId}`,
      track: "song",
      creation_revision: record.creationRevision,
      audio_revision: record.audioRevision,
      lyrics_state: { current: record.lyrics },
      updated_at: "2026-09-09T00:00:00Z",
      status: "published",
      published_resource: {
        post_id: `post-${record.submissionId}`,
        href: `/posts/post-${record.submissionId}`,
      },
    };
  }
  return {
    submission_id: record.submissionId,
    author_persona: {
      persona_id: record.personaId,
      object: "persona",
      display_name: "Song fixture persona",
      avatar_ref: null,
      primary_public_handle: "song-fixture",
    },
    href: `/media-post-submissions/${record.submissionId}`,
    track: "song",
    creation_revision: record.creationRevision,
    audio_revision: record.audioRevision,
    lyrics_state: { current: record.lyrics },
    updated_at: "2026-09-09T00:00:00Z",
    status: record.status,
    phase: record.phase,
  };
}

function submissionRecord(submissionId, personaId) {
  const existing = submissions.get(submissionId);
  if (existing !== undefined) return existing;
  const record = {
    submissionId,
    personaId,
    creationRevision: 1,
    audioRevision: 0,
    status: "processing",
    phase: "awaiting_upload",
    lyrics: { status: "not_bound" },
    finalizeCount: 0,
    termsCount: 0,
    lyricsCount: 0,
  };
  submissions.set(submissionId, record);
  return record;
}

const upstream = createServer(async (incoming, outgoing) => {
  const send = (status, payload) => {
    outgoing.writeHead(status, { "content-type": "application/json" });
    outgoing.end(JSON.stringify(payload));
  };
  try {
    const body = await readBody(incoming);
    const pathname = new URL(incoming.url ?? "/", apiOrigin).pathname;

    if (pathname === "/health") return send(200, { ok: true });
    if (pathname === "/users/me") return send(200, userFixture());
    if (pathname === "/personas") return send(200, personasFixture());

    const route = /^\/c\/(community_[^/]+)$/u.exec(pathname);
    if (incoming.method === "GET" && route !== null && communitiesById.has(route[1])) {
      return send(200, communityRouteFixture(route[1]));
    }
    const preview = /^\/communities\/(community_[^/]+)\/preview$/u.exec(pathname);
    if (incoming.method === "GET" && preview !== null && communitiesById.has(preview[1])) {
      return send(200, communityPreviewFixture(preview[1]));
    }

    // The audio object store. The browser PUTs the file the author chose, and
    // a real store is a different origin, so it answers the preflight too.
    const upload = /^\/uploads\/([^/]+)$/u.exec(pathname);
    if (incoming.method === "OPTIONS" && upload !== null) {
      outgoing.writeHead(204, {
        "access-control-allow-origin": solidOrigin,
        "access-control-allow-methods": "PUT, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "600",
      });
      outgoing.end();
      return;
    }
    if (incoming.method === "PUT" && upload !== null) {
      uploads.push({ key: upload[1], bytes: body.byteLength, type: incoming.headers["content-type"] });
      outgoing.writeHead(200, {
        etag: '"song-fixture"',
        "access-control-allow-origin": solidOrigin,
        "access-control-expose-headers": "etag",
      });
      outgoing.end();
      return;
    }

    const reserve = /^\/communities\/(community_[^/]+)\/media-upload-reservations$/u.exec(pathname);
    if (incoming.method === "POST" && reserve !== null) {
      mediaCalls.push({ kind: "reserve", community: communitiesById.get(reserve[1]) });
      return send(201, {
        reservation_id: `reservation-${communitiesById.get(reserve[1])}`,
        track: "song",
        slot: "primary_audio",
        status: "awaiting_upload",
        upload: {
          method: "PUT",
          url: `${apiOrigin}/uploads/${communitiesById.get(reserve[1])}`,
          required_headers: [{ name: "content-type", value: "audio/mpeg" }],
          expires_at: "2027-01-01T00:00:00Z",
        },
      });
    }

    const start = /^\/communities\/(community_[^/]+)\/media-post-submissions$/u.exec(pathname);
    if (incoming.method === "POST" && start !== null) {
      const community = communitiesById.get(start[1]);
      mediaCalls.push({ kind: "start", community });
      const record = submissionRecord(`submission-${community}`, `persona-song-${community}`);
      return send(201, snapshotFor(record));
    }

    const command = /^\/media-post-submissions\/([^/]+)(?:\/([a-z-]+))?$/u.exec(pathname);
    if (command !== null) {
      const record = submissions.get(command[1]);
      if (record === undefined) return send(404, { error: { code: "not_found", message: "unknown submission", retryable: false } });
      const kind = command[2] ?? "read";
      if (incoming.method === "GET" && kind === "read") {
        mediaCalls.push({ kind, submission: record.submissionId });
        return send(200, snapshotFor(record));
      }
      mediaCalls.push({ kind, submission: record.submissionId });
      if (kind === "finalize") {
        record.finalizeCount += 1;
        record.audioRevision = 1;
        record.phase = "analysis";
      } else if (kind === "terms") {
        record.termsCount += 1;
        record.creationRevision += 1;
        // Terms are the last thing the composer binds, so the song publishes.
        record.status = "published";
      } else if (kind === "lyrics") {
        record.lyricsCount += 1;
        record.creationRevision += 1;
        const parsed = JSON.parse(body.toString("utf8"));
        record.lyrics = {
          status: "ready",
          text: parsed.lyrics,
          lyrics_revision: record.creationRevision,
          audio_revision: record.audioRevision,
        };
      }
      return send(200, snapshotFor(record));
    }

    mediaCalls.push({ kind: "unmatched", method: incoming.method, pathname });
    return send(404, { error: { code: "not_found", message: "fixture route not found", retryable: false } });
  } catch (error) {
    send(500, { error: String(error) });
  }
});

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise(resolve => setTimeout(resolve, 5_000))]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

async function waitForWorker(child, readSpawnError) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Solid dev Worker exited with ${child.exitCode}`);
    const spawnError = readSpawnError();
    if (spawnError !== undefined) throw spawnError;
    try {
      const response = await fetch(`${solidOrigin}/api/health`);
      if (response.ok) return;
    } catch {
      // The Worker is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("Solid dev Worker did not become ready");
}

async function warmApplication() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(solidOrigin);
      const body = await response.text();
      if (response.ok && body.includes("app-root")) return;
    } catch {
      // Dependency optimization or SSR reload is still settling.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("Solid application did not become warm");
}

async function authenticatedPage(browser) {
  // Vite injects its development client without the production response nonce;
  // CSP itself is covered by hydration-check.
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1280, height: 900 } });
  await context.addCookies([
    { name: "pirate_session_fixture", value: "session-song-e2e", url: solidOrigin, httpOnly: true, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", error => browserErrors.push(`pageerror:${error.message}`));
  page.on("console", message => { if (message.type() === "error") browserErrors.push(`console:${message.text()}`); });
  await page.goto(solidOrigin, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { document.cookie = "__Host-pirate_csrf=csrf-song-e2e; Path=/; Secure; SameSite=Lax"; });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("[data-home-session]").waitFor({ state: "attached" });
  for (let index = 0; index < 100; index += 1) {
    const current = await page.locator("[data-home-session]").getAttribute("data-home-session");
    if (current !== "resolving") break;
    await page.waitForTimeout(100);
  }
  const session = await page.locator("[data-home-session]").getAttribute("data-home-session");
  assert(session === "authenticated", `browser session resolved as ${session}; errors: ${JSON.stringify(browserErrors)}`);
  return { context, page, browserErrors };
}

/** A minimal MPEG audio frame. The composer accepts MP3 by type and extension. */
function mp3Fixture(name) {
  const frame = Buffer.alloc(1_024);
  frame[0] = 0xff;
  frame[1] = 0xfb;
  frame[2] = 0x90;
  frame[3] = 0x00;
  return { name, mimeType: "audio/mpeg", buffer: frame };
}

async function publishSong(page, community, { lyrics }) {
  const communityId = communityIds[community];
  const response = await page.goto(`${solidOrigin}/c/${communityId}`, { waitUntil: "domcontentloaded" });
  const html = await response.text();
  assert(html.includes('data-community-state="success"'), "Community page did not render on the server");
  await page.locator("#app-root[data-hydrated='true']").waitFor({ state: "attached" });
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Post here" }).click();

  const form = page.getByRole("form", { name: "Create a post" });
  await form.waitFor({ state: "visible" });
  assert(await page.getByRole("dialog").count() === 0, "the composer opened as a dialog around the form");

  // Choosing a song is choosing the audio. The wizard follows the file.
  const audioInput = form.locator('input[aria-label="Upload audio"]').first();
  try {
    await audioInput.waitFor({ state: "attached", timeout: 15_000 });
  } catch (error) {
    process.stderr.write(`open(${community}): ${JSON.stringify((await form.innerText()).slice(0, 400))}\n`);
    throw error;
  }
  await audioInput.setInputFiles(mp3Fixture(`${community}.mp3`));
  await form.getByRole("navigation", { name: "Steps" }).waitFor({ state: "visible" });

  const title = form.getByLabel("Title", { exact: true });
  if (await title.count() > 0) await title.fill(`Fixture song ${community}`);

  // The step indicator repeats every step name as a button, so the footer's
  // forward control is addressed directly rather than by label.
  const forward = form.locator("[data-composer-forward]");
  const currentStep = (name) => form.getByRole("button", { name, exact: true }).and(form.locator('[aria-current="step"]'));
  const waitForForward = async () => {
    await forward.waitFor({ state: "visible" });
    await page.waitForFunction(
      selector => {
        const button = document.querySelector(selector);
        return button instanceof HTMLButtonElement && !button.disabled && button.getAttribute("aria-busy") !== "true";
      },
      "form[aria-label='Create a post'] [data-composer-forward]",
    );
  };
  await forward.click();
  await currentStep("Lyrics").waitFor({ state: "visible" });
  const lyricsField = form.getByLabel("Lyrics", { exact: true });
  if (lyrics !== "") {
    await lyricsField.fill(lyrics);
    await form.getByRole("button", { name: "Save reviewed lyrics" }).click();
    const deadline = Date.now() + 10_000;
    while (!mediaCalls.some(call => call.kind === "lyrics" && call.submission === `submission-${community}`)) {
      if (Date.now() >= deadline) throw new Error(`reviewed lyrics were not saved for ${community}`);
      await page.waitForTimeout(25);
    }
  }
  await waitForForward();
  await forward.click();
  await currentStep("Rights").waitFor({ state: "visible" });
  await waitForForward();
  await forward.click();
  await currentStep("Review").waitFor({ state: "visible" });

  if (lyrics !== "") {
    const review = await form.innerText();
    assert(!review.includes("Instrumental"),
      `reviewed lyrics never reached the submission: ${review.slice(0, 300)}`);
  }
  assert(await form.getByRole("button", { name: "Publish song" }).count() > 0,
    `the review step was never reached: ${(await form.innerText()).slice(0, 300)}`);
  await form.getByRole("button", { name: "Publish song" }).click();
  try {
    await form.waitFor({ state: "hidden", timeout: 20_000 });
  } catch (error) {
    process.stderr.write(`publish: ${JSON.stringify((await form.innerText()).slice(0, 500))}\n`);
    process.stderr.write(`calls: ${JSON.stringify(mediaCalls.filter(call => call.kind !== "unmatched"))}\n`);
    throw error;
  }
  return form;
}

let worker;
let browser;
let workerLog = "";
let workerSpawnError;
const appendWorkerLog = chunk => { workerLog = `${workerLog}${chunk.toString()}`.slice(-64 * 1024); };

try {
  await listen(upstream, apiPort);
  worker = spawn("bun", ["x", "vite", "dev", "--host", "127.0.0.1", "--port", String(solidPort), "--strictPort"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, NO_COLOR: "1", SOLID_API_NEXT_FIXTURE_ORIGIN: apiOrigin },
    stdio: ["ignore", "pipe", "pipe"],
  });
  worker.once("error", error => { workerSpawnError = error; });
  worker.stdout.on("data", appendWorkerLog);
  worker.stderr.on("data", appendWorkerLog);
  await waitForWorker(worker, () => workerSpawnError);
  await warmApplication();
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });

  const { context, page, browserErrors } = await authenticatedPage(browser);
  try {
    for (const [community, lyrics] of [
      ["with-lyrics", "One line of reviewed lyrics"],
      ["instrumental", ""],
    ]) {
      await publishSong(page, community, { lyrics });
    }
  } finally {
    await context.close();
  }

  const withLyrics = submissions.get("submission-with-lyrics");
  const instrumental = submissions.get("submission-instrumental");
  assert(withLyrics !== undefined && instrumental !== undefined, "a song submission was never started");
  for (const record of [withLyrics, instrumental]) {
    assert(record.status === "published", `${record.submissionId} ended as ${record.status}`);
    assert(record.finalizeCount === 1, `${record.submissionId} finalized ${record.finalizeCount} times`);
    assert(record.termsCount === 1, `${record.submissionId} bound terms ${record.termsCount} times`);
    assert(record.audioRevision === 1, `${record.submissionId} published without stored audio`);
  }
  assert(withLyrics.lyricsCount === 1, `lyrics were sent ${withLyrics.lyricsCount} times`);
  assert(withLyrics.lyrics.status === "ready", "reviewed lyrics were not accepted");
  // Blank lyrics are an instrumental, not an empty lyrics document.
  assert(instrumental.lyricsCount === 0, "an instrumental sent a lyrics command");
  assert(instrumental.lyrics.status === "not_bound", "an instrumental bound lyrics");
  assert(uploads.length === 2, `expected two audio uploads, received ${uploads.length}`);
  for (const upload of uploads) {
    assert(upload.bytes > 0, `${upload.key} uploaded no bytes`);
    assert(upload.type === "audio/mpeg", `${upload.key} uploaded as ${upload.type}`);
  }

  console.log(JSON.stringify({
    ok: true,
    scenarios: ["song_with_lyrics", "song_instrumental"],
    publishedOnce: true,
    audioStored: uploads.length,
    principal: "user-song-e2e",
  }));
} catch (error) {
  if (workerLog) process.stderr.write(workerLog);
  throw error;
} finally {
  if (browser !== undefined) await browser.close();
  if (worker !== undefined) await stop(worker);
  if (upstream.listening) await new Promise(resolve => upstream.close(resolve));
}
