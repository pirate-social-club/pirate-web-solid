/** @jsxImportSource @solidjs/web */
import { afterEach, describe, expect, test, vi } from "vitest";
import { render as solidRender } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";

import type { PostCommunitiesCommunityIdMediaUploadReservationsResponse } from "@pirate/api-client";

import type { ActivePersonaPublicProjection } from "../../../api/session";
import type { MediaSubmissionSnapshot } from "../media-submission/contracts";
import { mediaCommandBody, type PersistedMediaCommand } from "../media-submission/pending";
import type { MediaCommandResult, MediaSubmissionTransport } from "../media-submission/transport";
import { buildCreatePostRequest, CreatePostDialog, initialOperationPersonaId } from "./create-post-dialog";
import { pendingBodyBytes, type PendingSubmissionEnvelopeV1 } from "./pending-submission";
import type { TextContentSubmissionV1 } from "./text-submission-contract";

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
  vi.restoreAllMocks();
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
    expires_at: "2099-01-01T00:00:00Z",
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

function publishedTextSnapshot(): TextContentSubmissionV1 {
  return {
    submission_id: "text-submission-1",
    href: "/text-content-submissions/text-submission-1",
    surface: "text_post",
    status: "published",
    result: { decision: "allow", reason_code: null },
    published_resource: { kind: "post", post_id: "post-1", href: "/posts/post-1" },
    review_ref: null,
    created_at: "2026-09-12T00:00:00Z",
    updated_at: "2026-09-12T00:00:00Z",
  };
}

interface TextPostRequestBody {
  readonly idempotency_key?: string;
  readonly persona_id?: string;
}

function envelopeBody(envelope: PendingSubmissionEnvelopeV1): TextPostRequestBody {
  // SAFETY: the bytes come from createPendingSubmissionEnvelope over a
  // generated text request; this test reads only closed scalar fields.
  return JSON.parse(new TextDecoder().decode(pendingBodyBytes(envelope))) as TextPostRequestBody;
}

class ProductionMediaTransport implements MediaSubmissionTransport {
  snapshot: MediaSubmissionSnapshot | null = null;
  readonly commands: PersistedMediaCommand[] = [];
  uploadCount = 0;
  failReads = false;

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
    if (this.failReads) throw new Error("API response was not valid JSON");
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

async function uploadAudio(name = "signal.mp3"): Promise<void> {
  const audio = new File([new Uint8Array([1, 2, 3, 4])], name, { type: "audio/mpeg", lastModified: 1 });
  const audioInput = document.body.querySelector<HTMLInputElement>("input[aria-label='Upload audio']")!;
  Object.defineProperty(audioInput, "files", { configurable: true, value: [audio] });
  audioInput.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.waitFor(() => expect(document.body.textContent).toContain(name));
}

async function continueToReview(): Promise<void> {
  await vi.waitFor(() => expect(button("Continue").disabled).toBe(false));
  button("Continue").click();
  await vi.waitFor(() => expect(document.body.textContent).toContain("What others may do with this song"));
  await vi.waitFor(() => expect(button("Continue").disabled).toBe(false));
  button("Continue").click();
  await vi.waitFor(() => expect(document.body.textContent).toContain("Permissions"));
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

  test("sends the page community context without exposing or accepting a raw identifier", async () => {
    const dispatched: PendingSubmissionEnvelopeV1[] = [];
    render(() => (
      <CreatePostDialog
        communityContext={{ id: "community-contextual", name: "Pirate Harbor" }}
        personas={[activePersona("persona-one", "Persona One")]}
        onOpenChange={() => {}}
        open
        transport={{ read: async () => null, dispatch: async (envelope) => { dispatched.push(envelope); throw new Error("network uncertain"); } }}
      />
    ));
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // The contextual composer carries the page community without host chrome:
    // no "Posting in" card, no raw identifier input.
    expect(document.body.textContent).not.toContain("Posting in");
    expect(document.body.querySelector("input[name='community-id']")).toBeNull();

    const publishButtons = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
      .filter(button => button.textContent?.trim() === "Publish post");
    expect(publishButtons).toHaveLength(1);
    expect(publishButtons[0]?.disabled).toBe(true);

    const body = document.body.querySelector<HTMLTextAreaElement>("#create-post-body")!;
    body.value = "A contextual post";
    body.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.waitFor(() => expect(publishButtons[0]?.disabled).toBe(false));
    publishButtons[0]!.click();
    await vi.waitFor(() => expect(dispatched).toHaveLength(1));
    expect(dispatched[0]!.same_origin_path).toBe("/api/communities/community-contextual/posts");
    expect(envelopeBody(dispatched[0]!).persona_id).toBe("persona-one");
  });

  test("authors as the app-selected profile and shows no identity control", async () => {
    const dispatched: PendingSubmissionEnvelopeV1[] = [];
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Harbor" }}
      onOpenChange={() => {}}
      open
      personaId="persona-two"
      personas={[activePersona("persona-one", "Persona One"), activePersona("persona-two", "Persona Two")]}
      transport={{ read: async () => null, dispatch: async (envelope) => { dispatched.push(envelope); throw new Error("network uncertain"); } }}
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // Identity is decided by the community's active profile before the
    // composer opens; the composer neither shows nor changes it.
    expect(document.body.querySelector("[data-operation-persona]")).toBeNull();
    expect(document.body.querySelector("[aria-label^='Post as:']")).toBeNull();
    expect(document.body.querySelector("[aria-label^='Posting as:']")).toBeNull();

    const body = document.body.querySelector<HTMLTextAreaElement>("#create-post-body")!;
    body.value = "A persona-authored text post";
    body.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const publish = button("Publish post");
    await vi.waitFor(() => expect(publish.disabled).toBe(false));
    publish.click();
    await vi.waitFor(() => expect(dispatched).toHaveLength(1));
    expect(envelopeBody(dispatched[0]!).persona_id).toBe("persona-two");
  });

  test("retries an ambiguous text submission with the exact retained request", async () => {
    const dispatched: PendingSubmissionEnvelopeV1[] = [];
    const onPublished = vi.fn();
    let attempts = 0;
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Harbor" }}
      onOpenChange={() => {}}
      onPublished={onPublished}
      open
      personaId="persona-one"
      personas={[activePersona("persona-one", "Persona One")]}
      transport={{
        read: async () => null,
        dispatch: async (envelope) => {
          dispatched.push(envelope);
          if (++attempts === 1) throw new Error("network uncertain");
          return publishedTextSnapshot();
        },
      }}
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const body = document.body.querySelector<HTMLTextAreaElement>("#create-post-body")!;
    body.value = "A retried post";
    body.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const publish = button("Publish post");
    await vi.waitFor(() => expect(publish.disabled).toBe(false));
    publish.click();

    await vi.waitFor(() => expect(document.body.textContent).toContain("Checking whether your post was accepted"));
    button("Check again").click();
    await vi.waitFor(() => expect(onPublished).toHaveBeenCalledOnce());
    expect(dispatched).toHaveLength(2);
    expect(dispatched[1]!.idempotency_key).toBe(dispatched[0]!.idempotency_key);
    expect(envelopeBody(dispatched[1]!)).toEqual(envelopeBody(dispatched[0]!));
  });

  test("destroys composer state when it closes and reopens", async () => {
    const [open, setOpen] = createSignal(true);
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Harbor" }}
      onOpenChange={setOpen}
      open={open()}
      personaId="persona-one"
      personas={[activePersona("persona-one", "Persona One")]}
      transport={{ read: async () => null, dispatch: async () => { throw new Error("not dispatched in this case"); } }}
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const body = document.body.querySelector<HTMLTextAreaElement>("#create-post-body")!;
    body.value = "Half-written post";
    body.dispatchEvent(new InputEvent("input", { bubbles: true }));

    setOpen(false);
    await vi.waitFor(() => expect(document.body.querySelector("form[aria-label='Create a post']")).toBeNull());
    setOpen(true);
    await vi.waitFor(() => expect(document.body.querySelector("#create-post-body")).not.toBeNull());
    expect(document.body.querySelector<HTMLTextAreaElement>("#create-post-body")!.value).toBe("");

    // The song side is destroyed the same way: an unfinished audio selection
    // does not survive the close, and the composer returns to a fresh text
    // draft with no attachment.
    await uploadAudio("abandoned.mp3");
    setOpen(false);
    await vi.waitFor(() => expect(document.body.querySelector("form[aria-label='Create a post']")).toBeNull());
    setOpen(true);
    await vi.waitFor(() => expect(document.body.querySelector("#create-post-body")).not.toBeNull());
    expect(document.body.textContent).not.toContain("abandoned.mp3");
    expect(document.body.querySelector<HTMLTextAreaElement>("#create-post-body")!.value).toBe("");
  });

  test("refuses to close while a submission outcome is unknown", async () => {
    const dispatched: PendingSubmissionEnvelopeV1[] = [];
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Harbor" }}
      onOpenChange={() => {}}
      open
      personaId="persona-one"
      personas={[activePersona("persona-one", "Persona One")]}
      transport={{ read: async () => null, dispatch: async (envelope) => { dispatched.push(envelope); throw new Error("network uncertain"); } }}
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const body = document.body.querySelector<HTMLTextAreaElement>("#create-post-body")!;
    body.value = "A post with an unknown outcome";
    body.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const publish = button("Publish post");
    await vi.waitFor(() => expect(publish.disabled).toBe(false));
    publish.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Checking whether your post was accepted"));

    document.body.querySelector<HTMLButtonElement>("button[aria-label='Close composer']")!.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Resolve it before closing."));
    expect(document.body.querySelector("form[aria-label='Create a post']")).not.toBeNull();
    expect(dispatched).toHaveLength(1);
  });

  test("refuses to close while a song command is unresolved", async () => {
    class AmbiguousTermsTransport extends ProductionMediaTransport {
      override async dispatch(command: PersistedMediaCommand): Promise<MediaCommandResult> {
        if (command.kind === "terms") throw new Error("network uncertain");
        return super.dispatch(command);
      }
    }
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Harbor" }}
      mediaTransport={new AmbiguousTermsTransport()}
      onOpenChange={() => {}}
      open
      personas={[activePersona("persona-one", "Persona One")]}
      principalId="account-one"
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await uploadAudio("unresolved.mp3");
    await continueToReview();
    button("Publish song").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("network uncertain"));

    document.body.querySelector<HTMLButtonElement>("button[aria-label='Close composer']")!.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("still has an unresolved command"));
    expect(document.body.querySelector("form[aria-label='Create a post']")).not.toBeNull();
  });

  test("allows closing after a known manual-review outcome", async () => {
    class ManualReviewTransport extends ProductionMediaTransport {
      override async dispatch(command: PersistedMediaCommand): Promise<MediaCommandResult> {
        const result = await super.dispatch(command);
        if (command.kind === "terms" && this.snapshot !== null) {
          this.snapshot = mediaSnapshot({
            ...this.snapshot,
            status: "manual_review",
            reason_code: "review_required",
            review_ref: "review-one",
          });
          return this.snapshot;
        }
        return result;
      }
    }
    const [open, setOpen] = createSignal(true);
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Harbor" }}
      mediaTransport={new ManualReviewTransport()}
      onOpenChange={setOpen}
      open={open()}
      personas={[activePersona("persona-one", "Persona One")]}
      principalId="account-one"
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await uploadAudio("moderated.mp3");
    await continueToReview();
    button("Publish song").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("This song is awaiting manual review."));

    document.body.querySelector<HTMLButtonElement>("button[aria-label='Close composer']")!.click();
    await vi.waitFor(() => expect(document.body.querySelector("form[aria-label='Create a post']")).toBeNull());
  });

  test("lets an author discard a non-retryable processing failure", async () => {
    class NonRetryableFailureTransport extends ProductionMediaTransport {
      override async dispatch(command: PersistedMediaCommand): Promise<MediaCommandResult> {
        const result = await super.dispatch(command);
        if (command.kind === "terms" && this.snapshot !== null) {
          this.snapshot = mediaSnapshot({
            ...this.snapshot,
            status: "processing_failed",
            reason_code: "workflow_terminal_unconverged",
            retry_count: 0,
            retryable: false,
          });
          return this.snapshot;
        }
        return result;
      }
    }
    let observationTick = () => {};
    vi.spyOn(globalThis, "setInterval").mockImplementation((callback) => {
      observationTick = () => callback();
      return setTimeout(() => {}, 0);
    });
    const mediaTransport = new NonRetryableFailureTransport();
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Harbor" }}
      mediaTransport={mediaTransport}
      onOpenChange={() => {}}
      open
      personas={[activePersona("persona-one", "Persona One")]}
      principalId="account-one"
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await uploadAudio("failed.mp3");
    await continueToReview();
    button("Publish song").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("workflow terminal unconverged"));
    expect([...document.body.querySelectorAll("button")].some(candidate => candidate.textContent?.trim() === "Retry processing")).toBe(false);

    const failedSnapshot = mediaTransport.snapshot;
    if (failedSnapshot === null) throw new Error("missing failed song fixture");
    mediaTransport.snapshot = mediaSnapshot({
      ...failedSnapshot,
      creation_revision: failedSnapshot.creation_revision + 1,
      status: "processing",
      phase: "publish",
    });
    observationTick();
    await vi.waitFor(() => expect(document.body.textContent).not.toContain("workflow terminal unconverged"));

    mediaTransport.snapshot = mediaSnapshot({
      ...mediaTransport.snapshot,
      status: "processing_failed",
      reason_code: "workflow_terminal_unconverged",
      retry_count: 0,
      retryable: false,
    });
    observationTick();
    await vi.waitFor(() => expect(document.body.textContent).toContain("workflow terminal unconverged"));

    button("Discard and start over").click();
    await vi.waitFor(() => expect(document.body.textContent).not.toContain("workflow terminal unconverged"));
    expect(document.body.querySelector<HTMLInputElement>("input[aria-label='Upload audio']")).not.toBeNull();
  });

  test("restores an edited share that exceeds the remainder and keeps the creator minimum", async () => {
    const mediaTransport = new ProductionMediaTransport();
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Harbor" }}
      mediaTransport={mediaTransport}
      onOpenChange={() => {}}
      open
      personas={[activePersona("persona-one", "Persona One"), activePersona("persona-two", "Persona Two")]}
      principalId="account-one"
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await uploadAudio("shares.mp3");
    button("Continue").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("What others may do with this song"));
    button("Add collaborator").click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    await vi.waitFor(() => expect(document.body.textContent).toContain("Only your profiles bound to this community can be added for now."));
    const collaborator = [...document.querySelectorAll<HTMLButtonElement>("[role='dialog'] button")]
      .find(candidate => candidate.textContent?.includes("Persona Two"))!;
    collaborator.click();
    const pickerShare = await vi.waitFor(() => {
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Share for Persona Two"]');
      expect(input).not.toBeNull();
      return input!;
    });
    pickerShare.value = "25";
    pickerShare.dispatchEvent(new Event("change", { bubbles: true }));
    const add = [...document.querySelectorAll<HTMLButtonElement>("[role='dialog'] button")]
      .find(candidate => candidate.textContent?.trim() === "Add")!;
    await vi.waitFor(() => expect(add.disabled).toBe(false));
    add.click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());

    const rowShare = document.querySelector<HTMLInputElement>('input[aria-label="Share for Persona Two"]')!;
    rowShare.value = "100";
    rowShare.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.body.textContent).toContain("That share leaves no room for your share."));
    expect(rowShare.value).toBe("25");

    rowShare.value = "150";
    rowShare.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.body.textContent).toContain("Enter a share between 0.01% and 100%."));
    expect(rowShare.value).toBe("25");
    expect(document.body.textContent).toContain("Persona One75%");
  });

  test("clears the collaborator sheet between opens", async () => {
    const mediaTransport = new ProductionMediaTransport();
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Harbor" }}
      mediaTransport={mediaTransport}
      onOpenChange={() => {}}
      open
      personas={[activePersona("persona-one", "Persona One"), activePersona("persona-two", "Persona Two")]}
      principalId="account-one"
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await uploadAudio("sheet-reset.mp3");
    button("Continue").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("What others may do with this song"));

    button("Add collaborator").click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    const search = document.querySelector<HTMLInputElement>('input[aria-label="Search profiles"]')!;
    search.value = "drift";
    search.dispatchEvent(new Event("change", { bubbles: true }));
    const collaborator = [...document.querySelectorAll<HTMLButtonElement>("[role='dialog'] button")]
      .find(candidate => candidate.textContent?.includes("Persona Two"))!;
    collaborator.click();
    const share = await vi.waitFor(() => {
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Share for Persona Two"]');
      expect(input).not.toBeNull();
      return input!;
    });
    share.value = "25";
    share.dispatchEvent(new Event("change", { bubbles: true }));

    const close = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
      .find(candidate => candidate.textContent?.trim() === "Close" || candidate.getAttribute("aria-label") === "Close")!;
    close.click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());

    button("Add collaborator").click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    expect(document.querySelector('input[aria-label="Share for Persona Two"]')).toBeNull();
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Search profiles"]')!.value).toBe("");
    const collaboratorAgain = [...document.querySelectorAll<HTMLButtonElement>("[role='dialog'] button")]
      .find(candidate => candidate.textContent?.includes("Persona Two"))!;
    collaboratorAgain.click();
    const emptyShare = await vi.waitFor(() => {
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Share for Persona Two"]');
      expect(input).not.toBeNull();
      return input!;
    });
    expect(emptyShare.value).toBe("");
  });

  test("uses the app-selected persona and otherwise defaults to the first active persona", () => {
    expect(initialOperationPersonaId([
      activePersona("persona-one", "Persona One"),
      activePersona("persona-two", "Persona Two"),
    ])).toBe("persona-one");
    expect(initialOperationPersonaId([
      activePersona("persona-one", "Persona One"),
      activePersona("persona-two", "Persona Two"),
    ], "persona-two")).toBe("persona-two");
    expect(initialOperationPersonaId([activePersona("persona-one", "Persona One")])).toBe("persona-one");
    expect(initialOperationPersonaId([])).toBeUndefined();
  });

  test("rejects invalid or oversized song files before reservation and accepts an uppercase MP3 filename", async () => {
    const mediaTransport = new ProductionMediaTransport();
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Harbor" }}
      mediaTransport={mediaTransport}
      onOpenChange={() => {}}
      open
      personas={[activePersona("persona-one", "Persona One")]}
      principalId="account-one"
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

    const oversized = new File([new Uint8Array([1])], "large.mp3", { type: "audio/mpeg" });
    Object.defineProperty(oversized, "size", { value: 64 * 1024 * 1024 + 1 });
    const replacementInput = document.body.querySelector<HTMLInputElement>("input[aria-label='Upload audio']")!;
    Object.defineProperty(replacementInput, "files", { configurable: true, value: [oversized] });
    replacementInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.body.textContent).toContain("Song audio must be 64 MiB or smaller."));
    expect(document.body.textContent).toContain("RIGHT.MP3");
    expect(mediaTransport.commands).toHaveLength(0);
  });

  test("routes an author-declared 18+ song through one reserve, start, finalize, and terms flow", async () => {
    const mediaTransport = new ProductionMediaTransport();
    const ids = ["reserve-key", "start-key", "finalize-key", "terms-key"];
    let idIndex = 0;
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Harbor" }}
      createMediaId={() => ids[idIndex++] ?? "unexpected-key"}
      mediaTransport={mediaTransport}
      onOpenChange={() => {}}
      open
      personas={[activePersona("persona-one", "Persona One")]}
      principalId="account-one"
    />);

    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await uploadAudio();
    const adultRating = document.body.querySelector<HTMLInputElement>('input[aria-label="18+ content"]');
    expect(adultRating).not.toBeNull();
    adultRating!.click();
    await vi.waitFor(() => expect(
      document.body.querySelector<HTMLInputElement>('input[aria-label="18+ content"]')?.checked,
    ).toBe(true));
    await vi.waitFor(() => expect(button("Continue").disabled).toBe(false));
    button("Continue").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("What others may do with this song"));
    button("Back").click();
    await vi.waitFor(() => {
      const retainedRating = document.body.querySelector<HTMLInputElement>('input[aria-label="18+ content"]');
      expect(retainedRating?.checked).toBe(true);
      expect(retainedRating?.disabled).toBe(true);
    });
    button("Continue").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("What others may do with this song"));
    await vi.waitFor(() => expect(button("Continue").disabled).toBe(false));
    button("Continue").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Permissions"));
    await vi.waitFor(() => expect(button("Publish song").disabled).toBe(false));
    button("Publish song").click();

    await vi.waitFor(() => expect(mediaTransport.commands.map(command => command.kind)).toEqual([
      "reserve",
      "start",
      "finalize",
      "terms",
    ]));
    expect(mediaTransport.uploadCount).toBe(1);
    expect(document.body.querySelector("button[aria-label^='Visibility:']")).toBeNull();

    const bodies = await Promise.all(mediaTransport.commands.map(async command => {
      const decoded: unknown = JSON.parse(new TextDecoder().decode(await mediaCommandBody(command)));
      // SAFETY: mediaCommandBody digest-checks command bytes built from
      // generated request bodies; this test reads only their persona field.
      return decoded as { persona_id?: string; author_declared_rating?: string };
    }));
    expect(bodies.every(body => body.persona_id === "persona-one")).toBe(true);
    expect(bodies.find((_body, index) => mediaTransport.commands[index]?.kind === "start")?.author_declared_rating).toBe("adult_18");
  });

  test("binds reviewed lyrics and named collaborators before publishing", async () => {
    const mediaTransport = new ProductionMediaTransport();
    const onPublished = vi.fn();
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Harbor" }}
      mediaTransport={mediaTransport}
      onOpenChange={() => {}}
      onPublished={onPublished}
      open
      personas={[activePersona("persona-one", "Persona One"), activePersona("persona-two", "Persona Two")]}
      principalId="account-one"
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await uploadAudio("words.mp3");

    button("Add lyrics (optional)").click();
    const lyrics = await vi.waitFor(() => {
      const value = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Lyrics"]');
      expect(value).not.toBeNull();
      return value!;
    });
    lyrics.value = "Reviewed words";
    lyrics.dispatchEvent(new Event("change", { bubbles: true }));

    button("Continue").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("What others may do with this song"));

    button("Add collaborator").click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    const collaborator = [...document.querySelectorAll<HTMLButtonElement>("[role='dialog'] button")]
      .find(candidate => candidate.textContent?.includes("Persona Two"))!;
    collaborator.click();
    const share = await vi.waitFor(() => {
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Share for Persona Two"]');
      expect(input).not.toBeNull();
      return input!;
    });
    share.value = "25";
    share.dispatchEvent(new Event("change", { bubbles: true }));
    const add = [...document.querySelectorAll<HTMLButtonElement>("[role='dialog'] button")]
      .find(candidate => candidate.textContent?.trim() === "Add")!;
    await vi.waitFor(() => expect(add.disabled).toBe(false));
    add.click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    await vi.waitFor(() => expect(document.body.textContent).toContain("Persona One75%"));
    expect(document.body.textContent).not.toContain("Your share — 100%");

    document.querySelector<HTMLInputElement>('input[type="radio"][value="commercial-remix"]')!.click();
    const revShare = await vi.waitFor(() => {
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Your share of remix earnings"]');
      expect(input).not.toBeNull();
      return input!;
    });
    revShare.value = "12.34";
    revShare.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(button("Continue").disabled).toBe(false));
    button("Continue").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Permissions"));
    await vi.waitFor(() => expect(button("Publish song").disabled).toBe(false));
    button("Publish song").click();

    await vi.waitFor(() => expect(mediaTransport.commands.map(command => command.kind)).toEqual([
      "reserve", "start", "finalize", "lyrics", "terms",
    ]));
    expect(mediaTransport.snapshot?.lyrics_state.current).toMatchObject({ status: "ready", text: "Reviewed words" });
    const terms = mediaTransport.commands.find(command => command.kind === "terms")!;
    expect(JSON.parse(new TextDecoder().decode(await mediaCommandBody(terms)))).toMatchObject({
      commercial_rev_share_bps: 1_234,
      royalty_allocations: [{ recipient_id: "persona-one", share_bps: 7_500 }, { recipient_id: "persona-two", share_bps: 2_500 }],
    });

    mediaTransport.snapshot = mediaSnapshot({ ...mediaTransport.snapshot!, status: "published",
      published_resource: { post_id: "post-production", href: "/posts/post-production" } });
    await vi.waitFor(() => expect(onPublished).toHaveBeenCalledOnce(), { timeout: 5_000 });
    expect(mediaTransport.commands.filter(command => command.kind === "lyrics")).toHaveLength(1);
    expect(mediaTransport.uploadCount).toBe(1);
  });

  test("publishes a song with deliberately empty lyrics through the designed steps", async () => {
    const mediaTransport = new ProductionMediaTransport();
    const onPublished = vi.fn();
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Pirate Harbor" }}
      mediaTransport={mediaTransport}
      onOpenChange={() => {}}
      onPublished={onPublished}
      open
      personaId="persona-two"
      personas={[activePersona("persona-one", "Persona One"), activePersona("persona-two", "Persona Two")]}
      principalId="account-one"
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    await uploadAudio("wordless.mp3");
    button("Continue").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("What others may do with this song"));
    await vi.waitFor(() => expect(button("Continue").disabled).toBe(false));
    button("Continue").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Instrumental"));
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

  test("keeps observing after a transient status failure and still marks the published song", async () => {
    const mediaTransport = new ProductionMediaTransport();
    const onPublished = vi.fn();
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Pirate Harbor" }}
      mediaTransport={mediaTransport}
      onOpenChange={() => {}}
      onPublished={onPublished}
      open
      personas={[activePersona("persona-one", "Persona One")]}
      principalId="account-one"
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const audioInput = document.body.querySelector<HTMLInputElement>("input[aria-label='Upload audio']")!;
    Object.defineProperty(audioInput, "files", { configurable: true, value: [new File([new Uint8Array([1])], "transient.mp3", { type: "audio/mpeg" })] });
    audioInput.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(button("Continue").disabled).toBe(false));
    button("Continue").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("What others may do with this song"));
    await vi.waitFor(() => expect(button("Continue").disabled).toBe(false));
    button("Continue").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Instrumental"));
    await vi.waitFor(() => expect(button("Publish song").disabled).toBe(false));
    button("Publish song").click();
    await vi.waitFor(() => expect(mediaTransport.commands.map(command => command.kind)).toEqual([
      "reserve", "start", "finalize", "terms",
    ]));

    // One automatic status check fails while the submission later becomes
    // published. Observation must back off and resume rather than pause
    // permanently, or the composer strands the published song.
    mediaTransport.failReads = true;
    await new Promise<void>(resolve => setTimeout(resolve, 4_000));
    mediaTransport.snapshot = mediaSnapshot({ ...mediaTransport.snapshot!, status: "published",
      published_resource: { post_id: "post-transient", href: "/posts/post-transient" } });
    mediaTransport.failReads = false;
    await vi.waitFor(() => expect(onPublished).toHaveBeenCalledOnce(), { timeout: 8_000 });
  }, 20_000);

  test("wizard navigation preserves state and supports back", async () => {
    const mediaTransport = new ProductionMediaTransport();
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Pirate Harbor" }}
      mediaTransport={mediaTransport}
      onOpenChange={() => {}}
      open
      personas={[activePersona("persona-one", "Persona One")]}
      principalId="account-one"
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    await uploadAudio("carry-through.mp3");
    button("Add lyrics (optional)").click();
    const lyrics = await vi.waitFor(() => {
      const value = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Lyrics"]');
      expect(value).not.toBeNull();
      return value!;
    });
    lyrics.value = "Verse one carries through";
    lyrics.dispatchEvent(new Event("change", { bubbles: true }));
    button("Continue").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("What others may do with this song"));

    button("Back").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("carry-through.mp3"));
    const lyricsAgain = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Lyrics"]')!;
    expect(lyricsAgain.value).toBe("Verse one carries through");
    const title = document.body.querySelector<HTMLInputElement>("input#song-track-title")!;
    expect(title.value).toBe("carry-through");
  });

  test("the contextual form renders one bordered composer with no persona UI", async () => {
    render(() => <CreatePostDialog
      communityContext={{ id: "community-one", name: "Pirate Harbor" }}
      mediaTransport={new ProductionMediaTransport()}
      onOpenChange={() => {}}
      open
      personas={[activePersona("persona-one", "Persona One"), activePersona("persona-two", "Persona Two")]}
      principalId="account-one"
    />);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const form = document.body.querySelector("form[aria-label='Create a post']");
    expect(form).toBeInstanceOf(HTMLFormElement);
    expect(document.body.querySelectorAll("[role='dialog']")).toHaveLength(0);
    const closeButtons = document.body.querySelectorAll("button[aria-label='Close composer']");
    expect(closeButtons).toHaveLength(1);
    expect(document.body.querySelectorAll("[aria-label^='Post as:']")).toHaveLength(0);
    expect(document.body.querySelectorAll("[aria-label^='Posting as:']")).toHaveLength(0);
    expect(document.body.textContent).not.toContain("Posting in");
  });
});

test.each([false, true])("retains video authority in global/contextual composer (context=%s)", async contextual => {
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
      videoStorage={videoStorage} videoTransport={{ execute, async read() { return snapshot; } }} fetchImpl={fetchImpl} />);
    const tab = [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === "Video")!;
    expect(tab).toBeDefined(); await vi.waitFor(() => expect(tab.disabled).toBe(false)); tab.focus(); tab.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Resume video submission"));
    expect(pickerClick).not.toHaveBeenCalled();
    if (!contextual) expect(document.querySelector<HTMLInputElement>('input[name="community-id"]')?.value).toBe("retained-community");
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
