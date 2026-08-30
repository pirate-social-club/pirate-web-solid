/** @jsxImportSource @solidjs/web */
import { afterEach, describe, expect, test, vi } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";

import type { PostCommunitiesCommunityIdMediaUploadReservationsResponse } from "@pirate/api-client";

import type { ActivePersonaPublicProjection } from "../../../api/session";
import type { MediaSubmissionSnapshot } from "../media-submission/contracts";
import { createMemoryMediaSubmissionStorage, mediaCommandBody, type PersistedMediaCommand } from "../media-submission/pending";
import type { MediaCommandResult, MediaSubmissionTransport } from "../media-submission/transport";
import { buildCreatePostRequest, CreatePostDialog, initialOperationPersonaId } from "./create-post-dialog";
import { createMemoryPendingSubmissionStorage, createPendingSubmissionEnvelope } from "./pending-submission";

const disposers: Array<() => void> = [];

function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot(rootDispose => {
    dispose = rootDispose;
    solidRender(ui, container);
  });
  disposers.push(() => {
    dispose();
    container.remove();
  });
  return container;
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

const activePersona = (personaId: string, displayName: string): ActivePersonaPublicProjection => ({
  personaId,
  displayName,
  avatarRef: null,
  primaryPublicHandle: null,
});

const reservation: PostCommunitiesCommunityIdMediaUploadReservationsResponse = {
  reservation_id: "reservation-production",
  track: "song",
  slot: "primary_audio",
  status: "awaiting_upload",
  upload: {
    method: "PUT",
    url: "https://upload.test/song",
    required_headers: [{ name: "content-type", value: "audio/mpeg" }],
    expires_at: "2026-08-27T00:00:00Z",
  },
};

function mediaSnapshot(patch: Partial<MediaSubmissionSnapshot> = {}): MediaSubmissionSnapshot {
  // SAFETY: the base fixture supplies every generated snapshot field and
  // callers only patch fields belonging to a reachable processing state.
  return {
    submission_id: "submission-production",
    author_persona: { persona_id: "persona-one", object: "persona", display_name: "Persona One", avatar_ref: null, primary_public_handle: null },
    href: "/media-post-submissions/submission-production",
    track: "song",
    creation_revision: 1,
    audio_revision: 0,
    lyrics_state: { current: { status: "not_bound" } },
    updated_at: "2026-08-26T00:00:00Z",
    status: "processing",
    phase: "awaiting_upload",
    ...patch,
  } as MediaSubmissionSnapshot;
}

class ProductionMediaTransport implements MediaSubmissionTransport {
  snapshot: MediaSubmissionSnapshot | null = null;
  readonly commands: PersistedMediaCommand[] = [];
  uploadCount = 0;

  async dispatch(command: PersistedMediaCommand): Promise<MediaCommandResult> {
    this.commands.push(command);
    if (command.kind === "reserve") return reservation;
    if (command.kind === "start") {
      this.snapshot = mediaSnapshot();
      return this.snapshot;
    }
    if (this.snapshot === null) throw new Error("missing test submission");
    if (command.kind === "terms") {
      this.snapshot = mediaSnapshot({ creation_revision: this.snapshot.creation_revision + 1 });
    } else if (command.kind === "finalize") {
      this.snapshot = mediaSnapshot({ creation_revision: this.snapshot.creation_revision, audio_revision: 1, phase: "analysis" });
    }
    return this.snapshot;
  }

  async read(): Promise<MediaSubmissionSnapshot | null> {
    return this.snapshot;
  }

  async upload(_reservation: PostCommunitiesCommunityIdMediaUploadReservationsResponse, audio: Blob): Promise<void> {
    expect(audio.size).toBeGreaterThan(0);
    this.uploadCount += 1;
  }
}

describe("create post request", () => {
  test("builds the community-scoped text post contract", () => {
    expect(buildCreatePostRequest({
      communityId: "  community-1 ",
      title: "  Hello Pirate ",
      body: "  A first post from the Solid shell. ",
      idempotencyKey: "idem-1",
    })).toEqual({
      path: { communityId: "community-1" },
      body: {
        idempotency_key: "idem-1",
        post_type: "text",
        authorship_mode: "human_direct",
        identity_mode: "public",
        visibility: "public",
        title: "Hello Pirate",
        body: "A first post from the Solid shell.",
      },
    });
  });

  test("uses the page community context without exposing or accepting a raw identifier", async () => {
    render(() => (
      <CreatePostDialog
        communityContext={{ id: "community-contextual", name: "Pirate Harbor" }}
        onOpenChange={() => {}}
        open
        storage={createMemoryPendingSubmissionStorage()}
      />
    ));
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(document.body.textContent).toContain("Posting in Pirate Harbor");
    expect(document.body.querySelector("input[name='community-id']")).toBeNull();
    expect(document.body.querySelector("[data-community-context='community-contextual']")).not.toBeNull();

    const publishButtons = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
      .filter(button => button.textContent?.trim() === "Publish post");
    expect(publishButtons).toHaveLength(1);
    expect(publishButtons[0]?.disabled).toBe(false);
  });

  test("keeps a pending envelope across dialog close and reopen", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    await storage.save(await createPendingSubmissionEnvelope({
      request: buildCreatePostRequest({ communityId: "community-1", title: "", body: "A durable draft", idempotencyKey: "pending-1" }),
      pendingRequestId: "pending-1",
      createdAt: "2026-08-21T00:00:00Z",
    }));
    const transport = {
      read: async () => null,
      dispatch: async () => { throw new Error("network uncertain"); },
    };
    const [open, setOpen] = createSignal(true);
    render(() => <CreatePostDialog
      open={open()}
      onOpenChange={setOpen}
      storage={storage}
      transport={transport}
    />);
    expect((await storage.loadAll()).length).toBe(1);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    setOpen(false);
    setOpen(true);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect((await storage.loadAll()).length).toBe(1);
    expect(document.body.textContent).toContain("Checking whether your post was accepted");
  });

  test("requires an explicit operation persona when more than one is active", () => {
    expect(initialOperationPersonaId([
      activePersona("persona-one", "Persona One"),
      activePersona("persona-two", "Persona Two"),
    ])).toBeUndefined();
    expect(initialOperationPersonaId([activePersona("persona-one", "Persona One")])).toBe("persona-one");
    expect(initialOperationPersonaId([])).toBeUndefined();
  });

  test("shows the operation-persona control and keeps song publish disabled before an explicit choice", async () => {
    render(() => <CreatePostDialog
      mediaStorage={createMemoryMediaSubmissionStorage()}
      mediaTransport={new ProductionMediaTransport()}
      onOpenChange={() => {}}
      open
      personas={[
        activePersona("persona-one", "Persona One"),
        activePersona("persona-two", "Persona Two"),
      ]}
      principalId="account-one"
      storage={createMemoryPendingSubmissionStorage()}
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const community = document.body.querySelector<HTMLInputElement>("input[name='community-id']")!;
    community.value = "community-one";
    community.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const audio = new File([new Uint8Array([1])], "choice.mp3", { type: "audio/mpeg" });
    const audioInput = document.body.querySelector<HTMLInputElement>("input[aria-label='Upload audio']")!;
    Object.defineProperty(audioInput, "files", { configurable: true, value: [audio] });
    audioInput.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(document.body.querySelector("select[aria-label='Operation persona']")).not.toBeNull());
    const publish = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Publish song")!;
    expect(publish.disabled).toBe(true);
    const selector = document.body.querySelector("select[aria-label='Operation persona']")!;
    Reflect.set(selector, "value", "persona-two");
    selector.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(publish.disabled).toBe(false));
  });

  test("rejects non-MP3 song files before reservation and accepts an uppercase MP3 filename", async () => {
    const mediaTransport = new ProductionMediaTransport();
    render(() => <CreatePostDialog
      mediaStorage={createMemoryMediaSubmissionStorage()}
      mediaTransport={mediaTransport}
      onOpenChange={() => {}}
      open
      personas={[activePersona("persona-one", "Persona One")]}
      principalId="account-one"
      storage={createMemoryPendingSubmissionStorage()}
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const audioInput = document.body.querySelector<HTMLInputElement>("input[aria-label='Upload audio']")!;
    expect(audioInput.accept).toBe(".mp3,audio/mpeg");
    const wav = new File([new Uint8Array([1])], "wrong.wav", { type: "audio/wav" });
    Object.defineProperty(audioInput, "files", { configurable: true, value: [wav] });
    audioInput.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(document.body.textContent).toContain("Public-song v1 currently accepts MP3 only."));
    expect(mediaTransport.commands).toHaveLength(0);

    const mp3 = new File([new Uint8Array([1])], "RIGHT.MP3", { type: "audio/mpeg" });
    Object.defineProperty(audioInput, "files", { configurable: true, value: [mp3] });
    audioInput.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(document.body.textContent).not.toContain("Public-song v1 currently accepts MP3 only."));
    expect(document.body.textContent).toContain("RIGHT.MP3");
    expect(mediaTransport.commands).toHaveLength(0);
  });

  test("routes a production song through one durable reserve, start, terms, upload, and finalize flow", async () => {
    const mediaStorage = createMemoryMediaSubmissionStorage();
    const mediaTransport = new ProductionMediaTransport();
    const ids = ["reserve-key", "start-key", "terms-key", "finalize-key"];
    let idIndex = 0;
    render(() => <CreatePostDialog
      createMediaId={() => ids[idIndex++] ?? "unexpected-key"}
      mediaStorage={mediaStorage}
      mediaTransport={mediaTransport}
      onOpenChange={() => {}}
      open
      personas={[activePersona("persona-one", "Persona One")]}
      principalId="account-one"
      storage={createMemoryPendingSubmissionStorage()}
    />);

    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const community = document.body.querySelector<HTMLInputElement>("input[name='community-id']")!;
    community.value = "community-one";
    community.dispatchEvent(new InputEvent("input", { bubbles: true }));

    const audio = new File([new Uint8Array([1, 2, 3, 4])], "signal.mp3", { type: "audio/mpeg", lastModified: 1 });
    const audioInput = document.body.querySelector<HTMLInputElement>("input[aria-label='Upload audio']")!;
    Object.defineProperty(audioInput, "files", { configurable: true, value: [audio] });
    audioInput.dispatchEvent(new Event("change", { bubbles: true }));

    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const post = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Publish song")!;
    expect(post.disabled).toBe(false);
    post.click();

    await vi.waitFor(() => expect(mediaTransport.commands.map(command => command.kind)).toEqual([
      "reserve",
      "start",
      "terms",
      "finalize",
    ]));
    expect(mediaTransport.uploadCount).toBe(1);
    expect((await mediaStorage.loadAll())).toHaveLength(1);

    const bodies = await Promise.all(mediaTransport.commands.map(async command => {
      const decoded: unknown = JSON.parse(new TextDecoder().decode(await mediaCommandBody(command)));
      // SAFETY: mediaCommandBody digest-checks command bytes built from
      // generated request bodies; this test reads only their persona field.
      return decoded as { persona_id?: string };
    }));
    expect(bodies.every(body => body.persona_id === "persona-one")).toBe(true);

    render(() => <CreatePostDialog
      createMediaId={() => "must-not-be-used"}
      mediaStorage={mediaStorage}
      mediaTransport={mediaTransport}
      onOpenChange={() => {}}
      open
      personas={[activePersona("persona-one", "Persona One")]}
      principalId="account-one"
      storage={createMemoryPendingSubmissionStorage()}
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(mediaTransport.commands.map(command => command.kind)).toEqual(["reserve", "start", "terms", "finalize"]);
    expect(mediaTransport.uploadCount).toBe(1);
  });
});
