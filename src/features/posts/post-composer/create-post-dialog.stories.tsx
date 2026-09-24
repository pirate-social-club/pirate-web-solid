// The product-path composer stories. The community page renders exactly this
// component (CreatePostDialog), so every flow reviewed here is the shipped
// surface; the Parts stories demonstrate the inner components in isolation.
import { createSignal, Show } from "solid-js";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { PostCommunitiesCommunityIdMediaUploadReservationsResponse } from "@pirate/api-client";

import type { ActivePersonaPublicProjection } from "../../../api/session";
import type { ActiveSongMediaPostSubmissionPage, MediaSubmissionSnapshot } from "../media-submission/contracts";
import { mediaCommandBody, type PersistedMediaCommand } from "../media-submission/pending";
import type { MediaCommandResult, MediaSubmissionTransport } from "../media-submission/transport";
import { CreatePostDialog } from "./create-post-dialog";
import { MobileFooterNav } from "../../shell/app-shell-chrome/app-shell-chrome";

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

type StoryOutcome = "published" | "manual_review" | "blocked" | "processing_failed";

function outcomeSnapshot(outcome: StoryOutcome, current: MediaSubmissionSnapshot): MediaSubmissionSnapshot {
  if (outcome === "published") return snapshot({ ...current, status: "published", published_resource: { post_id: "post-story", href: "/posts/story-song-title" } });
  if (outcome === "manual_review") return snapshot({ ...current, status: "manual_review", reason_code: "review_required", review_ref: "review-story" });
  if (outcome === "blocked") return snapshot({ ...current, status: "blocked", reason_code: "policy_violation" });
  return snapshot({ ...current, status: "processing_failed", reason_code: "transform_failed", retry_count: 1, retryable: true });
}

/** In-memory song transport: one reserve/start/upload/finalize pipeline that
 * accepts lyrics and terms and settles on the requested outcome. */
class StoryMediaTransport implements MediaSubmissionTransport {
  async listActive(): Promise<ActiveSongMediaPostSubmissionPage> { return { object: "active_song_media_post_submission_page", items: [], next_cursor: null }; }
  snapshot: MediaSubmissionSnapshot | null = null;
  readonly commands: PersistedMediaCommand[] = [];
  uploadCount = 0;
  readonly outcome: StoryOutcome;

  constructor(outcome: StoryOutcome = "published") {
    this.outcome = outcome;
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
      this.snapshot = outcomeSnapshot(this.outcome, this.snapshot);
      return this.snapshot;
    }
    if (command.kind === "finalize") {
      this.snapshot = snapshot({ creation_revision: this.snapshot.creation_revision, audio_revision: 1, phase: "analysis" });
      if (this.outcome !== "published") this.snapshot = outcomeSnapshot(this.outcome, this.snapshot);
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

/** A song transport whose audio upload never completes, so Continue fails. */
class FailingUploadStoryTransport extends StoryMediaTransport {
  override async upload(): Promise<void> {
    throw new Error("The audio upload did not finish. Try again.");
  }
}

/** A transport whose server holds one unfinished song for this community. */
class ResumableSongStoryTransport extends StoryMediaTransport {
  override async listActive(): Promise<ActiveSongMediaPostSubmissionPage> {
    return {
      object: "active_song_media_post_submission_page",
      items: [{
        object: "active_song_media_post_submission", community_id: "community-one", title: "Midnight waves",
        song_type: "original", author_declared_rating: "general",
        terms_state: { current: { status: "not_bound" } }, submission: snapshot(),
      }],
      next_cursor: null,
    };
  }
}

const storyMp3 = (name = "midnight-waves.mp3") =>
  new File([new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])], name, { type: "audio/mpeg" });

async function uploadStorySong(canvas: ReturnType<typeof within>): Promise<void> {
  await userEvent.upload(await canvas.findByLabelText("Upload audio"), storyMp3());
  // Upload dispatch does not await metadata extraction. The field can exist
  // before its value settles, so presence alone is not a readiness assertion.
  await waitFor(async () => {
    await expect(canvas.getByRole("textbox", { name: "Song title" })).toHaveValue("midnight-waves");
  });
}

async function continueSongStep(canvas: ReturnType<typeof within>): Promise<void> {
  const button = await canvas.findByRole("button", { name: "Continue" });
  await waitFor(async () => { await expect(button).toBeEnabled(); });
  await userEvent.click(button);
}

interface StoryOptions {
  readonly personaCount?: 1 | 2;
  readonly personaId?: string;
  readonly mediaTransport?: MediaSubmissionTransport;
}

function dialogHarness(options: StoryOptions = {}) {
  const mediaTransport = options.mediaTransport ?? new StoryMediaTransport();
  return {
    mediaTransport,
    render: (open = true) => (
      <CreatePostDialog
        communityContext={{ id: "community-one", name: "Pirate Harbor" }}
        mediaTransport={mediaTransport}
        onOpenChange={() => {}}
        onPublished={() => {}}
        open={open}
        personaId={options.personaId}
        personas={personas(options.personaCount ?? 1)}
        principalId="account-one"
      />
    ),
  };
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
          "The shipped posting form: the same surface the community page opens through Post here. It adds no dialog chrome, profile choice, or audience policy; the app supplies that context. Deterministic in-memory transports stand in for the network.",
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

/** A host that honours dismissal. The other stories pin `open` and ignore
 * `onOpenChange`, which is right for reviewing a surface but means closing can
 * only be assumed there. This one closes, and offers the way back, so dismissal
 * and reopening can be observed. */
export const ContextualTextDismissible: Story = {
  name: "Contextual / Text / Dismissible",
  render: () => {
    const [open, setOpen] = createSignal(true);
    const mediaTransport = new StoryMediaTransport();
    return (
      <>
        <Show when={!open()}>
          <button onClick={() => setOpen(true)} type="button">Open the composer</button>
        </Show>
        <CreatePostDialog
          communityContext={{ id: "community-one", name: "Pirate Harbor" }}
          mediaTransport={mediaTransport}
          onOpenChange={setOpen}
          onPublished={() => {}}
          open={open()}
          personas={personas(1)}
          principalId="account-one"
        />
      </>
    );
  },
};

export const ContextualTextMobile: Story = {
  ...ContextualText,
  name: "Contextual / Text / Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

/** The composer opens over a page whose mobile tab bar stays mounted, as on a
 * community page. The composer must cover that bar: on a Pixel the bar sat in
 * the same layer, rendered later, and took the tap meant for "Publish video". */
export const ContextualTextOverMobileNavigation: Story = {
  name: "Contextual / Text / Over mobile navigation",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => (
    <>
      {dialogHarness().render()}
      <MobileFooterNav
        forceMobile
        labels={{ home: "Home", songs: "Your songs", wallet: "Wallet", profile: "Profile", primaryNavAriaLabel: "Primary navigation" }}
      />
    </>
  ),
  play: async ({ canvasElement }) => {
    const form = await within(canvasElement).findByRole("form", { name: "Create a post" });
    const nav = canvasElement.ownerDocument.querySelector("nav[aria-label='Primary navigation']");
    await expect(nav).not.toBeNull();
    const box = nav!.getBoundingClientRect();
    await expect(box.height).toBeGreaterThan(0);
    const hit = canvasElement.ownerDocument.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    await expect(hit !== null && form.contains(hit)).toBe(true);
  },
};

/** The server holds an unfinished song. The song tool opens the Song tab,
 * which lists it beside Add audio, instead of the audio picker. */
export const SongUnfinishedToResumeMobile: Story = {
  name: "Song / Unfinished song to resume / Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => dialogHarness({ mediaTransport: new ResumableSongStoryTransport() }).render(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    // The mobile viewport re-renders the story once; keep tapping the song
    // tool until the Song tab shows the list, as an author would.
    await waitFor(async () => {
      if (!canvas.queryByText("Unfinished songs")) await userEvent.click(canvas.getByRole("button", { name: /^(Song|Audio)$/u }));
      await expect(canvas.getByText("Unfinished songs")).toBeInTheDocument();
    }, { timeout: 5000 });
    await expect(canvas.getByRole("button", { name: "Resume Midnight waves" })).toBeInTheDocument();
  },
};

export const ContextualTextMultiplePersonas: Story = {
  name: "Contextual / Text / App-selected persona",
  render: () => dialogHarness({ personaCount: 2, personaId: "persona-two" }).render(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByRole("button", { name: "Post" })).toBeInTheDocument();
    await waitFor(async () => {
      await expect(canvas.queryByRole("button", { name: /^Post as: / })).not.toBeInTheDocument();
    });
  },
};

export const SongStepSong: Story = {
  name: "Song / Step 1 — Song",
  render: () => dialogHarness().render(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await uploadStorySong(canvas);
  },
};

export const SongStepSongMobile: Story = {
  ...SongStepSong,
  name: "Song / Step 1 — Song / Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const SongLyricsOnSongStep: Story = {
  name: "Song / Lyrics on the Song step",
  render: () => dialogHarness().render(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await uploadStorySong(canvas);
    const lyrics = await canvas.findByLabelText("Lyrics (optional)");
    await userEvent.type(lyrics, "A line carried on the tide");
    await waitFor(async () => { await expect(lyrics).toHaveValue("A line carried on the tide"); });
  },
};

export const SongStepRights: Story = {
  name: "Song / Step 2 — Rights",
  render: () => dialogHarness().render(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await uploadStorySong(canvas);
    await continueSongStep(canvas);
    await expect(await canvas.findByText("Your share of remix earnings")).toBeInTheDocument();
    await expect(await canvas.findByText("Earnings split")).toBeInTheDocument();
    await expect(await canvas.findByText("Persona One")).toBeInTheDocument();
  },
};

/** Two eligible profiles so the collaborator picker can be exercised. */
export const SongStepRightsCollaborators: Story = {
  name: "Song / Step 2 — Rights / Collaborators",
  render: () => dialogHarness({ personaCount: 2 }).render(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await uploadStorySong(canvas);
    await continueSongStep(canvas);
    await expect(await canvas.findByText("Earnings split")).toBeInTheDocument();
  },
};

export const SongStepReview: Story = {
  name: "Song / Step 3 — Review",
  render: () => dialogHarness().render(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await uploadStorySong(canvas);
    await continueSongStep(canvas);
    // Both steps name their action Continue. Confirm the new step before
    // looking up the next action, rather than clicking the old button twice.
    await expect(await canvas.findByText("Your share of remix earnings")).toBeInTheDocument();
    await continueSongStep(canvas);
    await expect(await canvas.findByText("Remix earnings")).toBeInTheDocument();
    await expect(await canvas.findByText("Earnings split")).toBeInTheDocument();
    await expect(await canvas.findByText("You 100%")).toBeInTheDocument();
    await expect(await canvas.findByText("No lyrics added")).toBeInTheDocument();
  },
};

/** A failed upload shows the retained file, its real error, and a retry. */
export const SongUploadFailed: Story = {
  name: "Song / States / Upload failed on Continue",
  render: () => dialogHarness({ mediaTransport: new FailingUploadStoryTransport() }).render(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await uploadStorySong(canvas);
    await continueSongStep(canvas);
    await expect(await canvas.findByRole("alert")).toHaveTextContent("The audio upload did not finish. Try again.");
    await expect(canvas.getByRole("heading", { name: "Audio upload needs another try" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Try upload again" })).toBeInTheDocument();
    await expect(canvas.queryByText(/awaiting upload/i)).not.toBeInTheDocument();
    await expect(canvas.queryByText("Your share of remix earnings")).not.toBeInTheDocument();
  },
};

export const SongUploadFailedMobile: Story = {
  ...SongUploadFailed,
  name: "Song / States / Upload failed on Continue / Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const SongManualReview: Story = {
  name: "Song / States / Manual review",
  render: () => dialogHarness({ mediaTransport: new StoryMediaTransport("manual_review") }).render(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await uploadStorySong(canvas);
    await continueSongStep(canvas);
    await expect(await canvas.findByText("This song is awaiting manual review.")).toBeInTheDocument();
  },
};

export const SongBlocked: Story = {
  name: "Song / States / Blocked",
  render: () => dialogHarness({ mediaTransport: new StoryMediaTransport("blocked") }).render(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await uploadStorySong(canvas);
    await continueSongStep(canvas);
    await expect(await canvas.findByText("This song was blocked by policy.")).toBeInTheDocument();
  },
};

export const SongRetryableFailure: Story = {
  name: "Song / States / Retryable failure",
  render: () => dialogHarness({ mediaTransport: new StoryMediaTransport("processing_failed") }).render(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await uploadStorySong(canvas);
    await continueSongStep(canvas);
    await expect(await canvas.findByText(/Song processing failed/)).toBeInTheDocument();
    await expect(await canvas.findByRole("button", { name: "Retry processing" })).toBeInTheDocument();
  },
};
