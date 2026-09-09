// The product-path composer stories. The community page renders exactly this
// component (CreatePostDialog), so every flow reviewed here is the shipped
// surface; the Parts stories demonstrate the inner components in isolation.
import { expect, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { PostCommunitiesCommunityIdMediaUploadReservationsResponse } from "@pirate/api-client";

import type { ActivePersonaPublicProjection } from "../../../api/session";
import type { MediaSubmissionSnapshot } from "../media-submission/contracts";
import {
  createMemoryMediaSubmissionStorage,
  MEDIA_PENDING_VERSION,
  mediaCommandBody,
  type PersistedMediaCommand,
} from "../media-submission/pending";
import type { MediaCommandResult, MediaSubmissionTransport } from "../media-submission/transport";
import { CreatePostDialog, PRODUCTION_SONG_DRAFT_ID } from "./create-post-dialog";
import { createMemoryPendingSubmissionStorage } from "./pending-submission";

const personas = (count: 1 | 2 = 1): ActivePersonaPublicProjection[] => [
  { personaId: "persona-one", displayName: "Persona One", avatarRef: null, primaryPublicHandle: "salt-cove.pirate", communityBinding: null },
  ...(count === 2
    ? [{ personaId: "persona-two", displayName: "Persona Two", avatarRef: null, primaryPublicHandle: "drift-reef.pirate", communityBinding: null }]
    : []),
];

const reservation: PostCommunitiesCommunityIdMediaUploadReservationsResponse = {
  reservation_id: "reservation-story",
  track: "song",
  slot: "primary_audio",
  status: "awaiting_upload",
  upload: {
    method: "PUT",
    url: "https://upload.test/song",
    required_headers: [{ name: "content-type", value: "audio/mpeg" }],
    expires_at: "2027-01-01T00:00:00Z",
  },
};

function snapshot(patch: Partial<MediaSubmissionSnapshot> = {}): MediaSubmissionSnapshot {
  const base = {
    submission_id: "submission-story",
    author_persona: { persona_id: "persona-one", object: "persona", display_name: "Persona One", avatar_ref: null, primary_public_handle: "salt-cove.pirate" },
    href: "/media-post-submissions/submission-story",
    track: "song",
    creation_revision: 1,
    audio_revision: 0,
    lyrics_state: { current: { status: "not_bound" } },
    updated_at: "2026-09-01T00:00:00Z",
    status: "processing",
    phase: "awaiting_upload",
    ...patch,
  };
  // SAFETY: the base fixture supplies every generated snapshot field and
  // patches only supply fields belonging to a reachable submission state.
  return base as MediaSubmissionSnapshot;
}

/** In-memory song transport: one reserve/start/upload/finalize pipeline that
 * accepts lyrics and terms and lands the song as published. */
class StoryMediaTransport implements MediaSubmissionTransport {
  snapshot: MediaSubmissionSnapshot | null = null;
  readonly commands: PersistedMediaCommand[] = [];
  uploadCount = 0;
  readonly publishOnTerms: boolean;

  constructor(publishOnTerms = true) {
    this.publishOnTerms = publishOnTerms;
  }

  async dispatch(command: PersistedMediaCommand): Promise<MediaCommandResult> {
    this.commands.push(command);
    if (command.kind === "reserve") return reservation;
    if (command.kind === "start") {
      this.snapshot = snapshot();
      return this.snapshot;
    }
    if (this.snapshot === null) throw new Error("missing story submission");
    if (command.kind === "terms") {
      this.snapshot = this.publishOnTerms
        ? snapshot({ ...this.snapshot, status: "published", published_resource: { post_id: "post-story", href: "/posts/post-story" } })
        : snapshot({ ...this.snapshot, creation_revision: this.snapshot.creation_revision + 1 });
      return this.snapshot;
    }
    if (command.kind === "finalize") {
      this.snapshot = snapshot({ creation_revision: this.snapshot.creation_revision, audio_revision: 1, phase: "analysis" });
      return this.snapshot;
    }
    if (command.kind === "lyrics") {
      const bodyValue: unknown = JSON.parse(new TextDecoder().decode(await mediaCommandBody(command)));
      // SAFETY: mediaCommandBody digest-checks generated request bytes; this
      // fixture reads only the lyrics field needed to model the API response.
      const body = bodyValue as { lyrics: string };
      const creationRevision = this.snapshot.creation_revision + 1;
      this.snapshot = snapshot({
        ...this.snapshot,
        creation_revision: creationRevision,
        audio_revision: 1,
        lyrics_state: { current: { status: "ready", text: body.lyrics, lyrics_revision: creationRevision, audio_revision: 1 } },
      });
    }
    return this.snapshot;
  }

  async read(): Promise<MediaSubmissionSnapshot | null> {
    return this.snapshot;
  }

  async upload(_reservation: PostCommunitiesCommunityIdMediaUploadReservationsResponse, audio: Blob): Promise<void> {
    if (audio.size === 0) throw new Error("story audio must not be empty");
    this.uploadCount += 1;
  }
}

const storyMp3 = (name = "midnight-waves.mp3") =>
  new File([new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])], name, { type: "audio/mpeg" });

interface StoryOptions {
  readonly communityContext?: boolean;
  readonly personaCount?: 1 | 2;
  readonly mediaTransport?: MediaSubmissionTransport;
  readonly publishOnTerms?: boolean;
}

function dialogHarness(options: StoryOptions = {}) {
  const mediaStorage = createMemoryMediaSubmissionStorage();
  const mediaTransport = options.mediaTransport ?? new StoryMediaTransport(options.publishOnTerms ?? true);
  return {
    mediaStorage,
    mediaTransport,
    render: (open = true) => (
      <CreatePostDialog
        communityContext={options.communityContext === false ? undefined : { id: "community-one", name: "Pirate Harbor" }}
        mediaStorage={mediaStorage}
        mediaTransport={mediaTransport}
        onOpenChange={() => {}}
        onPublished={() => {}}
        open={open}
        personas={personas(options.personaCount ?? 1)}
        principalId="account-one"
        storage={createMemoryPendingSubmissionStorage()}
      />
    ),
  };
}

/** Seed a retained song record so the restore path lands mid-wizard. */
async function seedRetainedSong(
  mediaStorage: ReturnType<typeof createMemoryMediaSubmissionStorage>,
  retained: { snapshot: MediaSubmissionSnapshot; songTitle?: string },
) {
  const audio = storyMp3("retained-song.mp3");
  await mediaStorage.save({
    version: MEDIA_PENDING_VERSION,
    draft_id: PRODUCTION_SONG_DRAFT_ID,
    principal_id: "account-one",
    community_id: "community-one",
    persona_id: "persona-one",
    song_draft: { title: retained.songTitle ?? "Retained song", song_type: "original", author_declared_rating: "general" },
    audio: { blob: audio, name: audio.name, type: audio.type, size: audio.size, last_modified: audio.lastModified },
    reservation,
    submission_id: retained.snapshot.submission_id,
    expected_creation_revision: retained.snapshot.creation_revision,
    upload_status: "uploaded",
    snapshot: retained.snapshot,
    commands: [],
    pending_command: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  });
}

const meta = {
  title: "Flows/Posts/CreatePostForm",
  component: CreatePostDialog,
  args: {
    open: true,
    onOpenChange: () => {},
  },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The shipped posting form: the same surface the community page opens through Post here. The form adds no card or dialog chrome, so the composer has one border and the identity sheet is its only modal. Deterministic in-memory storages and transports stand in for the network.",
      },
    },
  },
} satisfies Meta<typeof CreatePostDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ContextualText: Story = {
  name: "Contextual / Text",
  render: () => dialogHarness().render(),
};

export const ContextualTextMobile: Story = {
  ...ContextualText,
  name: "Contextual / Text / Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const ContextualTextMultiplePersonas: Story = {
  name: "Contextual / Text / Multiple personas",
  render: () => dialogHarness({ personaCount: 2 }).render(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: /^Post as: / }));
    const row = canvas.getByText("drift-reef.pirate");
    await userEvent.click(row.closest("button")!);
    await expect(canvas.getByRole("button", { name: /Post as: drift-reef\.pirate/ })).toBeInTheDocument();
  },
};

export const GlobalCommunityId: Story = {
  name: "Global / Raw community id",
  parameters: { docs: { description: { story: "The global Create post path still asks for a raw community identifier. Its friendly-picker redesign is registered separately." } } },
  render: () => dialogHarness({ communityContext: false }).render(),
};

export const SongStepOne: Story = {
  name: "Song / Step 1 — Song",
  render: () => dialogHarness().render(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.upload(canvas.getByLabelText("Upload audio"), storyMp3());
    await expect(canvas.getByLabelText("Song title")).toHaveValue("midnight-waves");
  },
};

export const SongStepOneMobile: Story = {
  ...SongStepOne,
  name: "Song / Step 1 — Song / Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const SongStepTwoLyrics: Story = {
  name: "Song / Step 2 — Lyrics",
  render: () => {
    const harness = dialogHarness();
    void seedRetainedSong(harness.mediaStorage, { snapshot: snapshot({ audio_revision: 1, phase: "analysis" }) });
    return harness.render();
  },
};

export const SongStepThreeRights: Story = {
  name: "Song / Step 3 — Rights",
  render: () => {
    const harness = dialogHarness();
    void seedRetainedSong(harness.mediaStorage, { snapshot: snapshot({ audio_revision: 1, phase: "analysis" }) });
    return harness.render();
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    await expect(canvas.getByText("Song kind")).toBeInTheDocument();
  },
};

export const SongStepFourReview: Story = {
  name: "Song / Step 4 — Review",
  render: () => {
    const harness = dialogHarness();
    void seedRetainedSong(harness.mediaStorage, { snapshot: snapshot({ audio_revision: 1, phase: "analysis" }) });
    return harness.render();
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    const review = canvas.getAllByRole("button", { name: "Review" })
      .find(button => button.closest("nav") === null);
    if (review === undefined) throw new Error("Rights footer did not render its Review action");
    await userEvent.click(review);
    await expect(canvas.getByText("Posting as")).toBeInTheDocument();
  },
};

export const SongEmptyLyricsPublished: Story = {
  name: "Song / Publish with deliberately empty lyrics",
  render: () => dialogHarness().render(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.upload(canvas.getByLabelText("Upload audio"), storyMp3("wordless.mp3"));
    await userEvent.click(canvas.getByRole("button", { name: "Upload and continue" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    const review = canvas.getAllByRole("button", { name: "Review" })
      .find(button => button.closest("nav") === null);
    if (review === undefined) throw new Error("Rights footer did not render its Review action");
    await userEvent.click(review);
    await expect(canvas.getByText("No lyrics")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Publish song" }));
    await expect(canvas.getByText("Song published.")).toBeInTheDocument();
  },
};

export const SongManualReview: Story = {
  name: "Song / States / Manual review",
  render: () => {
    const harness = dialogHarness();
    void seedRetainedSong(harness.mediaStorage, { snapshot: snapshot({ audio_revision: 1, status: "manual_review" }) });
    return harness.render();
  },
};

export const SongBlocked: Story = {
  name: "Song / States / Blocked",
  render: () => {
    const harness = dialogHarness();
    void seedRetainedSong(harness.mediaStorage, { snapshot: snapshot({ audio_revision: 1, status: "blocked" }) });
    return harness.render();
  },
};

export const SongRetryableFailure: Story = {
  name: "Song / States / Retryable failure",
  render: () => {
    const harness = dialogHarness();
    void seedRetainedSong(harness.mediaStorage, {
      snapshot: snapshot({ audio_revision: 1, status: "processing_failed", reason_code: "transform_failed", retryable: true }),
    });
    return harness.render();
  },
};

export const SongPublished: Story = {
  name: "Song / States / Published",
  render: () => {
    const harness = dialogHarness();
    void seedRetainedSong(harness.mediaStorage, {
      snapshot: snapshot({ audio_revision: 1, status: "published", published_resource: { post_id: "post-story", href: "/posts/post-story" } }),
    });
    return harness.render();
  },
};
