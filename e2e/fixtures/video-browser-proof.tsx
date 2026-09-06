/** @jsxImportSource @solidjs/web */
import "../../src/index.css";
import { render } from "@solidjs/web";
import { createRoot, createSignal, Show } from "solid-js";
import { CreatePostDialog } from "../../src/features/posts/post-composer/create-post-dialog";
import { createMemoryPendingSubmissionStorage } from "../../src/features/posts/post-composer/pending-submission";
import { createMemoryMediaSubmissionStorage } from "../../src/features/posts/media-submission/pending";
import { VideoCoordinator } from "../../src/features/posts/video-submission/coordinator";
import { createBrowserVideoStorage } from "../../src/features/posts/video-submission/storage";
import { createVideoTransport } from "../../src/features/posts/video-submission/transport";
import { VideoPlayer } from "../../src/features/posts/video-submission/video-player";
import type { OriginalVideoReservation, VideoSnapshot } from "../../src/features/posts/video-submission/contracts";

// This ledger models only a fixture server across browser processes. It is not authentication.
const key = "video-browser-proof-server";
const read = () => JSON.parse(localStorage.getItem(key) ?? '{"calls":[],"failed":false,"finalized":false,"denied":false}');
function event(call: string) { const state = read(); state.calls.push(call); localStorage.setItem(key, JSON.stringify(state)); }
const common = { track: "video" as const, intent: "original_audio" as const, submission_id: "submission-fixture", author_persona: { object: "persona" as const, persona_id: "persona-fixture", display_name: null, avatar_ref: null, primary_public_handle: null }, creation_revision: 1, video_revision: 0, caption: "", updated_at: "2026-09-06T00:00:00Z", href: "/media-post-submissions/submission-fixture" };
function snapshot(): VideoSnapshot {
  return read().finalized ? { ...common, status: "processing", phase: "analysis", creation_revision: 2, video_revision: 1 } : { ...common, status: "processing", phase: "awaiting_upload" };
}
function reservation(): OriginalVideoReservation {
  const state = read(); const started = state.started ?? Date.now();
  return { track: "video", intent: "original_audio", status: "awaiting_upload", slot: "primary_video", author_persona_id: "persona-fixture", ingest_policy_revision: 1, reservation_id: "reservation-fixture", upload: { method: "MULTIPART", upload_id: "upload-fixture", part_count: 3, part_size_bytes: 3, expires_at: new Date(started + 3600_000).toISOString(), parts: [1, 2, 3].map(n => ({ part_number: n, url: `https://upload.fixture.test/${n}`, expires_at: new Date(started + 2000).toISOString() })) } };
}
const fixtureFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input)); const path = url.pathname; const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
  if (url.hostname === "upload.fixture.test") {
    event(`put:${path.slice(1)}`); const state = read();
    if (path === "/2" && !state.failed) { state.failed = true; localStorage.setItem(key, JSON.stringify(state)); throw new TypeError("Fixture network loss"); }
    event(`bytes:${await (init!.body as Blob).text()}`); return new Response(null, { headers: { etag: `receipt-${path.slice(1)}` } });
  }
  let result: unknown;
  if (path.endsWith("/media-upload-reservations")) {
    event("reserve"); const state = read(); state.started = Date.now(); localStorage.setItem(key, JSON.stringify(state)); result = reservation();
  } else if (path.endsWith("/media-post-submissions")) { event("start"); result = snapshot(); }
  else if (path.endsWith("/parts/renew")) {
    event(`renew:${body.part_numbers.join(",")}`); const value = reservation(); result = { ...value, upload: { ...value.upload, parts: value.upload.parts.filter(p => body.part_numbers.includes(p.part_number)).map(p => ({ ...p, expires_at: new Date(Date.now() + 3600_000).toISOString() })) } };
  } else if (path.endsWith("/finalize")) {
    event("finalize"); const state = read(); state.finalized = true; localStorage.setItem(key, JSON.stringify(state)); result = snapshot();
  } else { event("read"); result = snapshot(); }
  return new Response(JSON.stringify(result), { status: path.endsWith("/media-upload-reservations") || path.endsWith("/media-post-submissions") ? 201 : 200, headers: { "content-type": "application/json" } });
};
createRoot(() => {
  const [message, setMessage] = createSignal("ready");
  const [dialog, setDialog] = createSignal<"global" | "conflict" | null>(null);
  const transport = createVideoTransport({ fetchImpl: fixtureFetch, csrfToken: () => "fixture-csrf" });
  const storage = createBrowserVideoStorage("account-fixture");
  const coordinator = new VideoCoordinator({ principalId: "account-fixture", storage,
    transport, fetchImpl: fixtureFetch });
  async function inspect() {
    const record = await storage.load(); const source = record ? await record.file.text() : null;
    setMessage(JSON.stringify({ source, community: record?.communityId, persona: record?.personaId, operation: record?.snapshot?.submission_id, parts: record?.receipts.map(p => p.part_number), pending: record?.pending?.command.kind ?? null, status: record?.snapshot?.status, phase: record?.snapshot?.status === "processing" ? record.snapshot.phase : null, server: read() }));
  }
  async function run(action: () => Promise<unknown>) { try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : "fixture failed"); } await inspect(); }
  render(() => <main>
    <h1>Local video recovery proof</h1>
    <button onClick={() => { void run(async () => { await storage.remove(); localStorage.removeItem(key); await coordinator.begin({ communityId: "community-fixture", personaId: "persona-fixture", file: new File(["abcdefghi"], "fixture.mp4", { type: "video/mp4" }), caption: "", rating: "general" }); await coordinator.submit(); }); }}>Start interrupted upload</button>
    <button onClick={() => { void run(() => coordinator.restore()); }}>Restore retained operation</button>
    <button onClick={() => { void run(() => coordinator.submit()); }}>Resume upload</button>
    <button onClick={() => { void inspect(); }}>Inspect retained operation</button>
    <button onClick={() => setDialog("global")}>Open global composer</button>
    <button onClick={() => setDialog("conflict")}>Open conflicting community composer</button>
    <pre data-proof-result>{message()}</pre>
    <Show when={dialog()}>{kind => <CreatePostDialog open onOpenChange={open => { if (!open) setDialog(null); }}
      principalId="account-fixture" personas={[{ personaId: "persona-fixture", displayName: "Fixture persona", avatarRef: null, primaryPublicHandle: null, communityBinding: null }]}
      communityContext={kind() === "conflict" ? { id: "other-community", name: "Other fixture community" } : undefined}
      storage={createMemoryPendingSubmissionStorage()} mediaStorage={createMemoryMediaSubmissionStorage()}
      videoStorage={storage} videoTransport={transport} fetchImpl={fixtureFetch} />}</Show>
    <VideoPlayer postId="post-fixture" state={{ playback: "ready", thumbnail: "pending" }} mint={async (_post, signal) => {
      event("mint"); if (signal.aborted || read().denied) throw new Error("Access denied");
      return { url: new URL("/__video-media/master.m3u8", location.origin).href, expiresAt: Date.now() + 30_000, renewAt: Date.now() + 15_000 };
    }} />
  </main>, document.getElementById("app")!);
});
