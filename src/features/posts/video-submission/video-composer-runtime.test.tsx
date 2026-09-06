/** @jsxImportSource @solidjs/web */
import { render } from "@solidjs/web";
import { createRoot } from "solid-js";
import { webcrypto } from "node:crypto";
import { ApiClientError } from "@pirate/api-client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { VideoComposerRuntime } from "./video-composer-runtime";
import type { PendingVideo, VideoStorage } from "./coordinator";
import type { VideoCommand, VideoTransport } from "./transport";
import type { OriginalVideoReservation, VideoSnapshot } from "./contracts";

const disposers: (() => void)[] = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function setup(final: "published" | "manual_review" | "provider_submission_unconfirmed" | "membership_required", rejectKind?: "reserve" | "start") {
  vi.stubGlobal("crypto", webcrypto);
  const urlApi = class extends URL { static createObjectURL() { return "blob:https://example.test/video"; } static revokeObjectURL() {} };
  vi.stubGlobal("URL", urlApi);
  let saved: PendingVideo | null = null;
  const storage: VideoStorage = { async exclusive(work) { return work(); }, async load() { return saved; }, async save(record) { saved = record; }, async remove() { saved = null; } };
  const reservation: OriginalVideoReservation = { track: "video", intent: "original_audio", status: "awaiting_upload", slot: "primary_video", author_persona_id: "persona", ingest_policy_revision: 1, reservation_id: "reservation",
    upload: { method: "MULTIPART", upload_id: "upload", part_count: 1, part_size_bytes: 10, expires_at: "2099-01-01T00:00:00Z", parts: [{ part_number: 1, url: "https://upload.example/1", expires_at: "2099-01-01T00:00:00Z" }] } };
  const common = { track: "video" as const, intent: "original_audio" as const, submission_id: "submission", author_persona: { object: "persona" as const, persona_id: "persona", display_name: null, avatar_ref: null, primary_public_handle: null }, creation_revision: 1, video_revision: 0, caption: "", updated_at: "2026-09-05T00:00:00Z", href: "/media-post-submissions/submission" };
  let snapshot: VideoSnapshot = { ...common, status: "processing", phase: "awaiting_upload" };
  const commands: VideoCommand[] = [];
  const transport: VideoTransport = { async read() { return snapshot; }, async execute(command) {
    commands.push(command);
    if (command.kind === rejectKind) throw new ApiClientError(
      { status: 400, code: "bad_request", name: "BadRequest", retryable: false },
      { error: { code: "bad_request", message: "Request refused", retryable: false } });
    if (command.kind === "reserve") return reservation;
    if (command.kind === "finalize") snapshot = final === "published"
      ? { ...common, creation_revision: 2, video_revision: 1, status: "published", published_resource: { post_id: "post", href: "/posts/post" } }
      : final === "manual_review"
        ? { ...common, creation_revision: 2, video_revision: 1, status: "manual_review", reason_codes: ["media_review_required"], review_ref: "review" }
        : { ...common, creation_revision: 2, video_revision: 1, status: "processing_failed", reason_code: final, retryable: final === "membership_required", retry_count: 0 };
    return snapshot;
  } };
  const published = vi.fn(); const container = document.createElement("div"); document.body.appendChild(container);
  createRoot(dispose => { disposers.push(dispose); render(() => <VideoComposerRuntime principalId="account" communityId="community" personaId="persona"
    storage={storage} transport={transport} inspectFile={async file => file}
    fetchImpl={vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { headers: { etag: "receipt" } }))}
    onExit={() => {}} onRetainedPersona={() => {}} onPublished={published} />, container); });
  return { commands, published };
}
async function selectAndPublish() {
  await vi.waitFor(() => expect(document.querySelector("[inert]")).toBeNull());
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["video"], "take.mp4", { type: "video/mp4" })] });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.waitFor(() => expect(document.querySelector("textarea")).not.toBeNull());
  const publish = [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === "Publish video")!;
  await vi.waitFor(() => expect(publish.disabled).toBe(false)); publish.click();
}
describe("mounted original video flow", () => {
  test.each(["reserve", "start"] as const)("a rejected %s returns to editing only on explicit action", async kind => {
    const fixture = setup("published", kind); await selectAndPublish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("request rejected"));
    const commandCount = fixture.commands.length;
    expect([...document.querySelectorAll("button")].some(button => button.textContent?.includes("Resume video submission"))).toBe(false);
    const edit = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("Edit rejected video"))!;
    await vi.waitFor(() => expect(edit.disabled).toBe(false)); edit.click();
    await vi.waitFor(() => expect(document.querySelector("textarea")).not.toBeNull());
    expect(document.body.textContent).toContain("Publish video");
    expect(fixture.commands).toHaveLength(commandCount);
    expect(fixture.published).not.toHaveBeenCalled();
  });
  test("reserves, uploads and finalizes without a title, terms or client poster", async () => {
    const fixture = setup("published"); await selectAndPublish();
    await vi.waitFor(() => expect(fixture.published).toHaveBeenCalledOnce());
    expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]);
    expect(fixture.commands[0]?.input.body).toMatchObject({ intent: "original_audio", persona_id: "persona" });
    expect(fixture.commands[1]?.input.body).not.toHaveProperty("title");
    expect(fixture.commands[2]?.input.body).toMatchObject({ parts: [{ part_number: 1, etag: "receipt" }] });
    expect(document.querySelector('a[href="/posts/post"]')?.textContent).toBe("View published post");
  });
  test("unconfirmed provider submission hides retry and explains reconciliation", async () => {
    setup("provider_submission_unconfirmed"); await selectAndPublish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("provider submission is unconfirmed"));
    expect([...document.querySelectorAll("button")].some(button => /Retry processing|Retry publication/.test(button.textContent ?? ""))).toBe(false);
  });
  test("membership loss offers publication retry with retained analysis", async () => {
    setup("membership_required"); await selectAndPublish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("posting eligibility"));
    expect(document.body.textContent).toContain("Retry publication"); expect(document.body.textContent).not.toContain("Retry processing");
  });
  test("a server review hold stays private and does not claim publication", async () => {
    const fixture = setup("manual_review"); await selectAndPublish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("No post is public yet"));
    expect(fixture.published).not.toHaveBeenCalled(); expect(document.querySelector("a")).toBeNull();
  });
});
