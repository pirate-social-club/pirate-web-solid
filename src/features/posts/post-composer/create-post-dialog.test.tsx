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
  communityBinding: null,
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
      this.snapshot = mediaSnapshot({ ...this.snapshot, creation_revision: this.snapshot.creation_revision + 1 });
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

function button(label: string): HTMLButtonElement {
  const result = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
    .find(button => button.textContent?.trim() === label);
  expect(result).toBeInstanceOf(HTMLButtonElement);
  return result!;
}

function identityTrigger(): HTMLButtonElement {
  const trigger = [...document.body.querySelectorAll<HTMLButtonElement>("button[aria-label^='Post as:']")][0];
  expect(trigger).toBeInstanceOf(HTMLButtonElement);
  return trigger!;
}

function personaRow(label: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll<HTMLButtonElement>("button")]
    .find(button => button.textContent?.includes("Your public profile")
      && button.textContent?.includes(label));
}

async function choosePersona(label: string): Promise<HTMLButtonElement> {
  identityTrigger().click();
  const row = await vi.waitFor(() => {
    const candidate = personaRow(label);
    expect(candidate).toBeInstanceOf(HTMLButtonElement);
    return candidate!;
  });
  row.click();
  // Selecting a persona closes the sheet, so the row disappears with it.
  await vi.waitFor(() => expect(personaRow(label)).toBeUndefined());
  return row;
}

async function continueToReview() {
  await vi.waitFor(() => expect(button("Upload and continue").disabled).toBe(false));
  button("Upload and continue").click();
  await vi.waitFor(() => expect(document.querySelector('textarea[aria-label="Lyrics (optional)"]')).not.toBeNull());
  button("Continue").click();
  await vi.waitFor(() => expect(button("Review").disabled).toBe(false));
  button("Review").click();
  await vi.waitFor(() => expect(button("Publish song").disabled).toBe(false));
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
    const storage = createMemoryPendingSubmissionStorage();
    const dispatch = vi.fn(async () => { throw new Error("network uncertain"); });
    render(() => (
      <CreatePostDialog
        communityContext={{ id: "community-contextual", name: "Pirate Harbor" }}
        personas={[activePersona("persona-one", "Persona One")]}
        onOpenChange={() => {}}
        open
        storage={storage}
        transport={{ read: async () => null, dispatch }}
      />
    ));
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // The contextual composer carries the page community without host chrome:
    // no "Posting in" card, no raw identifier input.
    expect(document.body.textContent).not.toContain("Posting in");
    expect(document.body.querySelector("input[name='community-id']")).toBeNull();
    expect(document.body.querySelector("[data-community-context='community-contextual']")).toBeNull();

    const publishButtons = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
      .filter(button => button.textContent?.trim() === "Publish post");
    expect(publishButtons).toHaveLength(1);
    expect(publishButtons[0]?.disabled).toBe(true);

    const body = document.body.querySelector<HTMLTextAreaElement>("#create-post-body")!;
    body.value = "A contextual post";
    body.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => expect(publishButtons[0]?.disabled).toBe(false));
    publishButtons[0]!.click();
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
    expect(decodePendingSubmissionDraft((await storage.loadAll())[0]!).communityId)
      .toBe("community-contextual");
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
    await choosePersona("Persona Two");
    await vi.waitFor(() => expect(publish.disabled).toBe(false));
    publish.click();
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
    // The retained request owns authorship: the sheet's persona rows freeze.
    identityTrigger().click();
    await vi.waitFor(() => expect(personaRow("Persona One")?.getAttribute("aria-disabled")).toBe("true"));
    await vi.waitFor(() => expect(personaRow("Persona Two")?.getAttribute("aria-pressed")).toBe("true"));
    identityTrigger().click();
    const audioInput = document.body.querySelector<HTMLInputElement>("input[aria-label='Upload audio']")!;
    Object.defineProperty(audioInput, "files", { configurable: true, value: [new File([new Uint8Array([1])], "choice.mp3", { type: "audio/mpeg" })] });
    audioInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.body.textContent).toContain("choice.mp3"));
    // Song mode owns a separate operation persona until a submission is retained.
    identityTrigger().click();
    const songRow = await vi.waitFor(() => {
      const candidate = personaRow("Persona One");
      expect(candidate).toBeInstanceOf(HTMLButtonElement);
      return candidate!;
    });
    expect(songRow.getAttribute("aria-disabled")).toBeNull();
    songRow.click();
    await vi.waitFor(() => expect(personaRow("Persona One")).toBeUndefined());
    document.body.querySelector<HTMLButtonElement>("button[aria-label='Remove audio']")!.click();
    await vi.waitFor(() => expect(document.body.querySelector("#create-post-body")).not.toBeNull());
    // Returning to text mode restores the frozen retained authorship.
    identityTrigger().click();
    await vi.waitFor(() => expect(personaRow("Persona Two")?.getAttribute("aria-pressed")).toBe("true"));
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

  test("does not reconcile another community's retained text request from a contextual composer", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    await storage.save(await createPendingSubmissionEnvelope({
      request: buildCreatePostRequest({ personaId: "persona-one", communityId: "original-community", title: "", body: "Retained draft", idempotencyKey: "retained-context", ageGatePolicy: "none" }),
      pendingRequestId: "retained-context",
      createdAt: "2026-09-07T00:00:00Z",
    }));
    const transport = { read: vi.fn(async () => null), dispatch: vi.fn(async () => { throw new Error("Unexpected dispatch"); }) };
    render(() => <CreatePostDialog open onOpenChange={() => {}}
      communityContext={{ id: "different-community", name: "Different community" }}
      storage={storage} transport={transport}
    />);
    await vi.waitFor(() => expect(document.body.textContent).toContain("retained submission belongs to another community"));
    const readsBeforeRetry = transport.read.mock.calls.length;
    const retry = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Check again");
    expect(retry).toBeDefined();
    retry!.click();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(transport.read).toHaveBeenCalledTimes(readsBeforeRetry);
    expect(transport.dispatch).not.toHaveBeenCalled();
    expect(decodePendingSubmissionDraft((await storage.loadAll())[0]!).communityId).toBe("original-community");
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

    // The MP3 enters the designed Song step, and the identity control is the
    // one persona entrance.
    await vi.waitFor(() => expect(document.body.textContent).toContain("choice.mp3"));
    await vi.waitFor(() => expect(button("Upload and continue").disabled).toBe(true));
    await choosePersona("Persona Two");
    await vi.waitFor(() => expect(button("Upload and continue").disabled).toBe(false));
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
    const ids = ["reserve-key", "start-key", "finalize-key", "terms-key"];
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

    await continueToReview();
    const post = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Publish song")!;
    expect(post.disabled).toBe(false);
    post.click();

    await vi.waitFor(() => expect(mediaTransport.commands.map(command => command.kind)).toEqual([
      "reserve",
      "start",
      "finalize",
      "terms",
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
    expect(mediaTransport.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize", "terms"]);
    expect(mediaTransport.uploadCount).toBe(1);
  });

  test("holds terms until reviewed lyrics are accepted and restores without rebinding", async () => {
    const mediaStorage = createMemoryMediaSubmissionStorage();
    const mediaTransport = new ProductionMediaTransport();
    const onPublished = vi.fn();
    render(() => <CreatePostDialog mediaStorage={mediaStorage} mediaTransport={mediaTransport}
      onOpenChange={() => {}} onPublished={onPublished} open
      personas={[activePersona("persona-one", "Persona One")]} principalId="account-one"
      communityContext={{ id: "community-one", name: "Test community" }} storage={createMemoryPendingSubmissionStorage()} />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Upload audio"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File([new Uint8Array([1])], "test.mp3", { type: "audio/mpeg" })] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(button("Upload and continue").disabled).toBe(false));
    expect(document.querySelector('textarea[aria-label="Lyrics (optional)"]')).toBeNull();
    button("Upload and continue").click();
    const lyrics = await vi.waitFor(() => {
      const value = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Lyrics (optional)"]');
      expect(value).not.toBeNull(); return value!;
    });
    expect(mediaTransport.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]);
    lyrics.value = "Reviewed words";
    lyrics.dispatchEvent(new Event("change", { bubbles: true }));
    button("Continue").click();
    await vi.waitFor(() => expect(button("Review").disabled).toBe(false));
    button("Add collaborator").click();
    await vi.waitFor(() => expect(document.querySelector('input[aria-label="Recipient 2 id"]')).not.toBeNull());
    async function changeInput(label: string, value: string) {
      const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    await changeInput("Recipient 2 id", "persona-collaborator");
    await changeInput("Recipient 1 share", "75");
    await changeInput("Recipient 2 share", "25");
    // The license choices are option cards, so the commercial-remix radio is
    // clicked directly rather than through a button lookup.
    document.querySelector<HTMLInputElement>('input[type="radio"][value="commercial-remix"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('input[aria-label="Downstream commercial remix share"]')).not.toBeNull());
    await changeInput("Downstream commercial remix share", "12.34");
    await vi.waitFor(() => expect(button("Review").disabled).toBe(false));
    button("Review").click();
    await vi.waitFor(() => expect(button("Publish song").disabled).toBe(false));
    button("Publish song").click();
    await vi.waitFor(() => expect(mediaTransport.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize", "lyrics", "terms"]));
    expect(mediaTransport.snapshot?.lyrics_state.current).toMatchObject({ status: "ready", text: "Reviewed words" });
    const terms = mediaTransport.commands.find(command => command.kind === "terms")!;
    expect(JSON.parse(new TextDecoder().decode(await mediaCommandBody(terms)))).toMatchObject({
      commercial_rev_share_bps: 1_234,
      royalty_allocations: [{ recipient_id: "persona-one", share_bps: 7_500 }, { recipient_id: "persona-collaborator", share_bps: 2_500 }],
    });
    mediaTransport.snapshot = mediaSnapshot({ ...mediaTransport.snapshot!, status: "published",
      published_resource: { post_id: "post-production", href: "/posts/post-production" } });
    await vi.waitFor(() => expect(onPublished).toHaveBeenCalledOnce(), { timeout: 5_000 });
    for (const dispose of disposers.splice(0)) dispose();
    document.body.replaceChildren();
    render(() => <CreatePostDialog mediaStorage={mediaStorage} mediaTransport={mediaTransport}
      onOpenChange={() => {}} open personas={[activePersona("persona-one", "Persona One")]}
      principalId="account-one" storage={createMemoryPendingSubmissionStorage()} />);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Song published."));
    expect(mediaTransport.commands.filter(command => command.kind === "lyrics")).toHaveLength(1);
    expect(mediaTransport.uploadCount).toBe(1);
  });

  test("the contextual form renders one bordered composer and opens only the identity modal", async () => {
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Pirate Harbor" }}
      mediaStorage={createMemoryMediaSubmissionStorage()}
      mediaTransport={new ProductionMediaTransport()}
      onOpenChange={() => {}}
      open
      personas={[activePersona("persona-one", "Persona One"), activePersona("persona-two", "Persona Two")]}
      principalId="account-one"
      storage={createMemoryPendingSubmissionStorage()}
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const form = document.body.querySelector("form[aria-label='Create a post']");
    expect(form).toBeInstanceOf(HTMLFormElement);
    expect(document.body.querySelectorAll("[role='dialog']")).toHaveLength(0);
    const closeButtons = document.body.querySelectorAll("button[aria-label='Close composer']");
    expect(closeButtons).toHaveLength(1);
    const identityControls = document.body.querySelectorAll("button[aria-label^='Post as:']");
    expect(identityControls).toHaveLength(1);
    // The page-form surface owns the one content scroller; the bordered
    // composer card and its steps must not nest another.
    const scrollers = [...document.body.querySelectorAll<HTMLElement>("[class*='overflow-y-auto']")];
    expect(scrollers).toHaveLength(1);
    expect([...document.body.querySelectorAll("button")].some(button => button.textContent?.trim() === "Cancel")).toBe(false);
    expect(document.body.textContent).not.toContain("Posting in");

    // Each active persona is a distinct public row in the identity sheet.
    identityTrigger().click();
    await vi.waitFor(() => {
      expect(document.body.querySelectorAll("[role='dialog']")).toHaveLength(1);
      expect(personaRow("Persona One")).toBeInstanceOf(HTMLButtonElement);
      expect(personaRow("Persona Two")).toBeInstanceOf(HTMLButtonElement);
    });
  });

  test("publishes a song with deliberately empty lyrics through the designed steps", async () => {
    const mediaStorage = createMemoryMediaSubmissionStorage();
    const mediaTransport = new ProductionMediaTransport();
    const ids = ["reserve-empty", "start-empty", "finalize-empty", "terms-empty"];
    let idIndex = 0;
    const onPublished = vi.fn();
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Pirate Harbor" }}
      createMediaId={() => ids[idIndex++] ?? "unexpected-key"}
      mediaStorage={mediaStorage}
      mediaTransport={mediaTransport}
      onOpenChange={() => {}}
      onPublished={onPublished}
      open
      personas={[activePersona("persona-one", "Persona One"), activePersona("persona-two", "Persona Two")]}
      principalId="account-one"
      storage={createMemoryPendingSubmissionStorage()}
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const audioInput = document.body.querySelector<HTMLInputElement>("input[aria-label='Upload audio']")!;
    Object.defineProperty(audioInput, "files", { configurable: true, value: [new File([new Uint8Array([1])], "wordless.mp3", { type: "audio/mpeg" })] });
    audioInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(button("Upload and continue").disabled).toBe(true));
    // The chosen operation persona authors every song command.
    await choosePersona("Persona Two");
    await vi.waitFor(() => expect(button("Upload and continue").disabled).toBe(false));
    button("Upload and continue").click();

    const lyrics = await vi.waitFor(() => {
      const value = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Lyrics (optional)"]');
      expect(value).not.toBeNull(); return value!;
    });
    expect(lyrics.value).toBe("");
    button("Continue").click();
    await vi.waitFor(() => expect(button("Review").disabled).toBe(false));
    button("Review").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("No lyrics"));
    await vi.waitFor(() => expect(button("Publish song").disabled).toBe(false));
    button("Publish song").click();

    // Deliberately empty lyrics never bind: no lyrics command is issued.
    await vi.waitFor(() => expect(mediaTransport.commands.map(command => command.kind)).toEqual([
      "reserve", "start", "finalize", "terms",
    ]));
    const bodies = await Promise.all(mediaTransport.commands.map(async command => {
      const decoded: unknown = JSON.parse(new TextDecoder().decode(await mediaCommandBody(command)));
      // SAFETY: mediaCommandBody digest-checks generated request bytes; this
      // reads only the persona field needed to prove authorship.
      return decoded as { persona_id?: string };
    }));
    expect(bodies.every(body => body.persona_id === "persona-two")).toBe(true);

    mediaTransport.snapshot = mediaSnapshot({ ...mediaTransport.snapshot!, status: "published",
      published_resource: { post_id: "post-wordless", href: "/posts/post-wordless" } });
    await vi.waitFor(() => expect(onPublished).toHaveBeenCalledOnce(), { timeout: 5_000 });
    expect(mediaTransport.commands.filter(command => command.kind === "lyrics")).toHaveLength(0);
    expect(mediaTransport.uploadCount).toBe(1);
  });

  test("wizard navigation preserves state and supports back", async () => {
    const mediaStorage = createMemoryMediaSubmissionStorage();
    const mediaTransport = new ProductionMediaTransport();
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Pirate Harbor" }}
      mediaStorage={mediaStorage}
      mediaTransport={mediaTransport}
      onOpenChange={() => {}}
      open
      personas={[activePersona("persona-one", "Persona One")]}
      principalId="account-one"
      storage={createMemoryPendingSubmissionStorage()}
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const audioInput = document.body.querySelector<HTMLInputElement>("input[aria-label='Upload audio']")!;
    Object.defineProperty(audioInput, "files", { configurable: true, value: [new File([new Uint8Array([1])], "carry-through.mp3", { type: "audio/mpeg" })] });
    audioInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(button("Upload and continue").disabled).toBe(false));
    button("Upload and continue").click();
    const lyrics = await vi.waitFor(() => {
      const value = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Lyrics (optional)"]');
      expect(value).not.toBeNull(); return value!;
    });
    lyrics.value = "Verse one carries through";
    lyrics.dispatchEvent(new Event("change", { bubbles: true }));
    button("Continue").click();
    await vi.waitFor(() => expect(button("Review").disabled).toBe(false));

    button("Back").click();
    const lyricsAgain = await vi.waitFor(() => {
      const value = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Lyrics (optional)"]');
      expect(value).not.toBeNull(); return value!;
    });
    expect(lyricsAgain.value).toBe("Verse one carries through");
    button("Back").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("carry-through.mp3"));
    const title = document.body.querySelector<HTMLInputElement>("input#song-track-title")!;
    expect(title.value).toBe("carry-through");
  });

  test("restores a retained song at the lyrics step with its original persona", async () => {
    const mediaStorage = createMemoryMediaSubmissionStorage();
    const audio = new File([new Uint8Array([1])], "retained.mp3", { type: "audio/mpeg", lastModified: 1 });
    await mediaStorage.save({
      version: MEDIA_PENDING_VERSION,
      draft_id: PRODUCTION_SONG_DRAFT_ID,
      principal_id: "account-one",
      community_id: "community-one",
      persona_id: "persona-one",
      song_draft: { title: "Retained song", song_type: "original", author_declared_rating: "general" },
      audio: { blob: audio, name: audio.name, type: audio.type, size: audio.size, last_modified: audio.lastModified },
      reservation,
      submission_id: "submission-production",
      expected_creation_revision: 1,
      upload_status: "uploaded",
      snapshot: mediaSnapshot({ audio_revision: 1, phase: "analysis" }),
      commands: [],
      pending_command: null,
      created_at: "2026-09-04T00:00:00Z",
      updated_at: "2026-09-04T00:00:00Z",
    });
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Pirate Harbor" }}
      mediaStorage={mediaStorage}
      mediaTransport={new ProductionMediaTransport()}
      onOpenChange={() => {}}
      open
      personas={[activePersona("persona-one", "Persona One"), activePersona("persona-two", "Persona Two")]}
      principalId="account-one"
      storage={createMemoryPendingSubmissionStorage()}
    />);
    await vi.waitFor(() => expect(document.querySelector('textarea[aria-label="Lyrics (optional)"]')).not.toBeNull());
    expect(identityTrigger().getAttribute("aria-label")).toContain("Persona One");
  });
});


test.each([false, true])("restores retained video authority in global/contextual composer (context=%s)", async contextual => {
  const { webcrypto } = await import("node:crypto");
  const originalCrypto = globalThis.crypto; const originalUrl = globalThis.URL;
  const pickerClick = vi.spyOn(HTMLInputElement.prototype, "click");
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("URL", class extends URL { static createObjectURL() { return "blob:https://example.test/video"; } static revokeObjectURL() {} });
  const snapshot: import("../video-submission/contracts").VideoSnapshot = {
    submission_id: "video-submission", author_persona: { object: "persona", persona_id: "persona-one", display_name: null, avatar_ref: null, primary_public_handle: null },
    href: "/media-post-submissions/video-submission", track: "video", intent: "original_audio", creation_revision: 1,
    video_revision: 0, caption: "", updated_at: "2026-09-05T00:00:00Z", status: "processing", phase: "awaiting_upload",
  };
  let saved: import("../video-submission/coordinator").PendingVideo | null = {
    version: "original-video-pending-v1", principalId: "account", communityId: "retained-community", personaId: "persona-one",
    file: new File(["video"], "take.mp4", { type: "video/mp4" }), caption: "", rating: "general", receipts: [], pending: null, snapshot,
    reservation: { reservation_id: "reservation", track: "video", intent: "original_audio", slot: "primary_video", status: "awaiting_upload", author_persona_id: "persona-one", ingest_policy_revision: 1,
      upload: { method: "MULTIPART", upload_id: "upload", part_size_bytes: 10, part_count: 1, expires_at: "2099-01-01T00:00:00Z", parts: [{ part_number: 1, url: "https://upload.example/1", expires_at: "2099-01-01T00:00:00Z" }] } },
  };
  const videoStorage: import("../video-submission/coordinator").VideoStorage = {
    async exclusive(work) { return work(); }, async load() { return saved; }, async save(record) { saved = record; }, async remove() { saved = null; },
  };
  const execute = vi.fn(async () => ({ ...snapshot, phase: "analysis" as const }));
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { headers: { etag: "receipt" } }));
  try {
    render(() => <CreatePostDialog open onOpenChange={() => {}} principalId="account" personas={[activePersona("persona-one", "Persona One")]}
      communityContext={contextual ? { id: "other-community", name: "Other community" } : undefined}
      storage={createMemoryPendingSubmissionStorage()} mediaStorage={createMemoryMediaSubmissionStorage()}
      videoStorage={videoStorage} videoTransport={{ execute, async read() { return snapshot; } }} fetchImpl={fetchImpl} />);
    const tab = [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === "Video")!;
    expect(tab).toBeDefined(); await vi.waitFor(() => expect(tab.disabled).toBe(false)); tab.focus(); tab.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Resume video submission"));
    expect(pickerClick).not.toHaveBeenCalled();
    if (!contextual) expect(document.querySelector<HTMLInputElement>('input[name="community-id"]')?.value).toBe("retained-community");
    else expect(document.body.textContent).toContain("retained submission belongs to another community");
    const resume = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("Resume video submission"))!;
    await vi.waitFor(() => expect(resume.disabled).toBe(false)); resume.click();
    if (contextual) {
      await vi.waitFor(() => expect(document.body.textContent).toContain("Resolve this retained video with its original community and persona"));
      expect(fetchImpl).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
    } else {
      await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
      expect(fetchImpl).toHaveBeenCalledOnce();
    }
  } finally { for (const dispose of disposers.splice(0)) dispose(); pickerClick.mockRestore(); vi.stubGlobal("crypto", originalCrypto); vi.stubGlobal("URL", originalUrl); }
});
