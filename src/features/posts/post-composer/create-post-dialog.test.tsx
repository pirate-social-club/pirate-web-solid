/** @jsxImportSource @solidjs/web */
import { afterEach, describe, expect, test, vi } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";

import type { PostCommunitiesCommunityIdMediaUploadReservationsResponse } from "@pirate/api-client";

import type { ActivePersonaPublicProjection } from "../../../api/session";
import type { MediaSubmissionSnapshot } from "../media-submission/contracts";
import { createMemoryMediaSubmissionStorage, MEDIA_PENDING_VERSION, mediaCommandBody, type PersistedMediaCommand } from "../media-submission/pending";
import type { MediaCommandResult, MediaSubmissionTransport } from "../media-submission/transport";
import { buildCreatePostRequest, CreatePostDialog, initialOperationPersonaId, PRODUCTION_SONG_DRAFT_ID } from "./create-post-dialog";
import { createMemoryPendingSubmissionStorage, createPendingSubmissionEnvelope, decodePendingSubmissionDraft } from "./pending-submission";

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
    } else if (command.kind === "lyrics") {
      const bodyValue: unknown = JSON.parse(new TextDecoder().decode(await mediaCommandBody(command)));
      // SAFETY: mediaCommandBody digest-checks generated request bytes; this
      // fixture reads only the lyrics field needed to model the API response.
      const body = bodyValue as { lyrics: string };
      const creationRevision = this.snapshot.creation_revision + 1;
      this.snapshot = mediaSnapshot({
        ...this.snapshot,
        creation_revision: creationRevision,
        audio_revision: 1,
        lyrics_state: {
          current: {
            status: "ready",
            text: body.lyrics,
            lyrics_revision: creationRevision,
            audio_revision: 1,
          },
        },
      });
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

class HeldProductionFinalizeTransport extends ProductionMediaTransport {
  private markFinalizeStarted!: () => void;
  readonly finalizeStarted = new Promise<void>(resolve => {
    this.markFinalizeStarted = resolve;
  });
  private releaseFinalization!: () => void;
  private readonly finalizationReleased = new Promise<void>(resolve => {
    this.releaseFinalization = resolve;
  });

  releaseFinalize(): void {
    this.releaseFinalization();
  }

  override async dispatch(command: PersistedMediaCommand): Promise<MediaCommandResult> {
    if (command.kind !== "finalize") return super.dispatch(command);
    this.commands.push(command);
    if (this.snapshot === null) throw new Error("missing test submission");
    const started = this.snapshot;
    this.snapshot = mediaSnapshot({
      status: "processing",
      creation_revision: started.creation_revision,
      audio_revision: 1,
      lyrics_state: started.lyrics_state,
      phase: "analysis",
    });
    this.markFinalizeStarted();
    await this.finalizationReleased;
    const current = this.snapshot;
    this.snapshot = mediaSnapshot({
      status: "published",
      creation_revision: current.creation_revision,
      audio_revision: current.audio_revision,
      lyrics_state: current.lyrics_state,
      published_resource: { post_id: "post-production", href: "/posts/post-production" },
    });
    return this.snapshot;
  }
}

describe("create post request", () => {
  test("builds the community-scoped text post contract", () => {
    expect(buildCreatePostRequest({ personaId: "persona-one",
      communityId: "  community-1 ",
      title: "  Hello Pirate ",
      body: "  A first post from the Solid shell. ",
      idempotencyKey: "idem-1",
      ageGatePolicy: "none",
    })).toEqual({
      path: { communityId: "community-1" },
      body: {
        idempotency_key: "idem-1",
        persona_id: "persona-one",
        post_type: "text",
        authorship_mode: "human_direct",
        identity_mode: "public",
        visibility: "public",
        author_declared_rating: "general",
        title: "Hello Pirate",
        body: "A first post from the Solid shell.",
      },
    });
  });

  test("maps the 18+ composer selection to the adult text rating", () => {
    expect(buildCreatePostRequest({ personaId: "persona-one",
      communityId: "community-1",
      title: "Night watch",
      body: "Adult-marked body",
      idempotencyKey: "idem-adult",
      ageGatePolicy: "18_plus",
    }).body.author_declared_rating).toBe("adult_18");
  });

  test("uses the page community context without exposing or accepting a raw identifier", async () => {
    render(() => (
      <CreatePostDialog
        communityContext={{ id: "community-contextual", name: "Pirate Harbor" }}
        personas={[activePersona("persona-one", "Persona One")]}
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
    expect(publishButtons[0]?.disabled).toBe(true);

    const body = document.body.querySelector<HTMLTextAreaElement>("#create-post-body")!;
    body.value = "A contextual post";
    body.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => expect(publishButtons[0]?.disabled).toBe(false));
  });

  test("requires a text persona choice and freezes its serialized identity after dispatch", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    const dispatch = vi.fn(async () => { throw new Error("network uncertain"); });
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Harbor" }}
      onOpenChange={() => {}}
      open
      personas={[activePersona("persona-one", "Persona One"), activePersona("persona-two", "Persona Two")]}
      storage={storage}
      transport={{ read: async () => null, dispatch }}
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const body = document.body.querySelector<HTMLTextAreaElement>("#create-post-body")!;
    body.value = "A persona-authored text post";
    body.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const publish = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Publish post")!;
    expect(publish.disabled).toBe(true);
    const selector = document.body.querySelector("select[aria-label='Operation persona']")!;
    Reflect.set(selector, "value", "persona-two");
    selector.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(publish.disabled).toBe(false));
    publish.click();
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
    expect(selector.hasAttribute("disabled")).toBe(true);
    const records = await storage.loadAll();
    expect(records).toHaveLength(1);
    expect(decodePendingSubmissionDraft(records[0]!).personaId).toBe("persona-two");
    const audioInput = document.body.querySelector<HTMLInputElement>("input[aria-label='Upload audio']")!;
    Object.defineProperty(audioInput, "files", { configurable: true, value: [new File([new Uint8Array([1])], "choice.mp3", { type: "audio/mpeg" })] });
    audioInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(selector.hasAttribute("disabled")).toBe(false));
    Reflect.set(selector, "value", "persona-one");
    selector.dispatchEvent(new Event("change", { bubbles: true }));
    document.body.querySelector<HTMLButtonElement>("button[aria-label='Remove audio']")!.click();
    await vi.waitFor(() => expect(selector.hasAttribute("disabled")).toBe(true));
    expect(selector.querySelector("option:checked")?.getAttribute("value")).toBe("persona-two");
    expect(decodePendingSubmissionDraft((await storage.loadAll())[0]!).personaId).toBe("persona-two");
  });

  test("keeps a pending envelope across dialog close and reopen", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    await storage.save(await createPendingSubmissionEnvelope({
      request: buildCreatePostRequest({ personaId: "persona-one", communityId: "community-1", title: "", body: "A durable draft", idempotencyKey: "pending-1", ageGatePolicy: "none" }),
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

  test("hydrates and locks the rating owned by a retained adult text request", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    await storage.save(await createPendingSubmissionEnvelope({
      request: buildCreatePostRequest({ personaId: "persona-one",
        communityId: "community-1",
        title: "Retained adult post",
        body: "A durable adult-marked draft",
        idempotencyKey: "pending-adult",
        ageGatePolicy: "18_plus",
      }),
      pendingRequestId: "pending-adult",
      createdAt: "2026-09-04T00:00:00Z",
    }));

    render(() => <CreatePostDialog
      onOpenChange={() => {}}
      open
      storage={storage}
      transport={{ read: async () => null, dispatch: async () => { throw new Error("network uncertain"); } }}
    />);

    const visibility = await vi.waitFor(() => {
      const candidate = document.body.querySelector<HTMLButtonElement>("button[aria-label^='Visibility:']");
      expect(candidate).toBeInstanceOf(HTMLButtonElement);
      expect(candidate?.getAttribute("aria-label")).toContain("18+");
      return candidate!;
    });
    expect(visibility.disabled).toBe(true);
  });

  test("locks a retained song rating after reservation and before start", async () => {
    const mediaStorage = createMemoryMediaSubmissionStorage();
    const audio = new File([new Uint8Array([1])], "retained.mp3", { type: "audio/mpeg", lastModified: 1 });
    await mediaStorage.save({
      version: MEDIA_PENDING_VERSION,
      draft_id: PRODUCTION_SONG_DRAFT_ID,
      principal_id: "account-one",
      community_id: "community-one",
      persona_id: "persona-one",
      song_draft: {
        title: "Retained song",
        song_type: "original",
        author_declared_rating: "adult_18",
      },
      audio: {
        blob: audio,
        name: audio.name,
        type: audio.type,
        size: audio.size,
        last_modified: audio.lastModified,
      },
      reservation,
      submission_id: null,
      expected_creation_revision: null,
      upload_status: "not_uploaded",
      snapshot: null,
      commands: [],
      pending_command: null,
      created_at: "2026-09-04T00:00:00Z",
      updated_at: "2026-09-04T00:00:00Z",
    });

    render(() => <CreatePostDialog
      mediaStorage={mediaStorage}
      mediaTransport={new ProductionMediaTransport()}
      onOpenChange={() => {}}
      open
      personas={[activePersona("persona-one", "Persona One")]}
      principalId="account-one"
      storage={createMemoryPendingSubmissionStorage()}
    />);

    const visibility = await vi.waitFor(() => {
      const candidate = document.body.querySelector<HTMLButtonElement>("button[aria-label^='Visibility:']");
      expect(candidate).toBeInstanceOf(HTMLButtonElement);
      expect(candidate?.getAttribute("aria-label")).toContain("18+");
      return candidate!;
    });
    expect(visibility.disabled).toBe(true);
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
    await vi.waitFor(() => expect([...document.body.querySelectorAll<HTMLButtonElement>("button")]
      .some(button => button.textContent?.trim() === "Publish song")).toBe(true));
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
    expect(document.body.querySelector<HTMLButtonElement>("button[aria-label^='Visibility:']")?.disabled).toBe(true);

    const bodies = await Promise.all(mediaTransport.commands.map(async command => {
      const decoded: unknown = JSON.parse(new TextDecoder().decode(await mediaCommandBody(command)));
      // SAFETY: mediaCommandBody digest-checks command bytes built from
      // generated request bodies; this test reads only their persona field.
      return decoded as { persona_id?: string; author_declared_rating?: string };
    }));
    expect(bodies.every(body => body.persona_id === "persona-one")).toBe(true);
    expect(bodies.find((_body, index) => mediaTransport.commands[index]?.kind === "start")?.author_declared_rating).toBe("general");

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

  test("saves reviewed lyrics while finalization is still pending and restores without rebinding", async () => {
    const mediaStorage = createMemoryMediaSubmissionStorage();
    const mediaTransport = new HeldProductionFinalizeTransport();
    const ids = ["reserve-key", "start-key", "terms-key", "finalize-key", "lyrics-key"];
    let idIndex = 0;
    const onPublished = vi.fn();
    render(() => <CreatePostDialog
      createMediaId={() => ids[idIndex++] ?? "unexpected-key"}
      mediaStorage={mediaStorage}
      mediaTransport={mediaTransport}
      onOpenChange={() => {}}
      onPublished={onPublished}
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

    const publish = await vi.waitFor(() => {
      const candidate = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.textContent?.trim() === "Publish song")!;
      expect(candidate).toBeInstanceOf(HTMLButtonElement);
      expect(candidate.disabled).toBe(false);
      return candidate;
    });
    publish.click();
    await mediaTransport.finalizeStarted;
    expect(document.body.querySelector("textarea[placeholder='Write or paste the song lyrics']")).toBeNull();
    expect([...document.body.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Save reviewed lyrics")).toBeUndefined();
    expect(mediaTransport.commands.filter(command => command.kind === "finalize")).toHaveLength(1);

    const lyrics = await vi.waitFor(() => {
      const candidate = document.body.querySelector<HTMLTextAreaElement>("textarea[placeholder='Write or paste the song lyrics']");
      expect(candidate).toBeInstanceOf(HTMLTextAreaElement);
      return candidate!;
    }, { timeout: 1_000 });
    lyrics.value = "Reviewed words";
    lyrics.dispatchEvent(new Event("change", { bubbles: true }));

    const saveLyrics = await vi.waitFor(() => {
      const candidate = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
        .find(button => button.textContent?.trim() === "Save reviewed lyrics")!;
      expect(candidate).toBeInstanceOf(HTMLButtonElement);
      expect(candidate.disabled).toBe(false);
      return candidate;
    });
    expect(publish.disabled).toBe(true);
    saveLyrics.click();
    await vi.waitFor(() => expect(mediaTransport.commands.filter(command => command.kind === "lyrics")).toHaveLength(1));

    mediaTransport.releaseFinalize();
    await vi.waitFor(() => expect(mediaTransport.snapshot).toMatchObject({
      status: "published",
      lyrics_state: { current: { status: "ready", text: "Reviewed words" } },
    }));
    expect(onPublished).toHaveBeenCalledTimes(1);

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
    expect(mediaTransport.commands.filter(command => command.kind === "lyrics")).toHaveLength(1);
  });
});
