import { createSignal } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { PostComposer } from "./post-composer";
import { baseComposer } from "./story-fixtures";
import { ComposerFrame } from "./story-helpers";
import type { AssetLicenseState, AssetRoyaltySplitState, SongComposerState } from "./types";

const meta = {
  title: "Parts/Posts/SongSteps",
  component: PostComposer,
  args: baseComposer,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The two entry paths the Parts level adds over the shipped flow: a text post that gains audio, and the Rights step's collaborator interaction. The shipped wizard — form, identity, upload, publication — lives under Flows/Posts/CreatePostForm.",
      },
    },
  },
} satisfies Meta<typeof PostComposer>;
export default meta;
type Story = StoryObj<typeof meta>;

function StatefulRightsStep() {
  const [song, setSong] = createSignal<SongComposerState>({ title: "Midnight Waves", primaryAudioLabel: "midnight-waves.mp3", lyricsEditorState: "ready" });
  const [lyrics, setLyrics] = createSignal("");
  const [license, setLicense] = createSignal<AssetLicenseState>({ presetId: "non-commercial" });
  const [royaltySplit, setRoyaltySplit] = createSignal<AssetRoyaltySplitState>({ allocations: [
    { id: "creator", recipientKind: "creator", recipientId: "persona-creator", shareBps: 10_000, sharePct: 100 },
  ] });
  return <ComposerFrame><PostComposer {...baseComposer} currentPersonaId="persona-creator"
    initialSongStep={3} mode="song" song={song()} onSongChange={setSong}
    lyricsValue={lyrics()} onLyricsValueChange={setLyrics} license={license()} onLicenseChange={setLicense}
    royaltySplit={royaltySplit()} onRoyaltySplitChange={setRoyaltySplit}
    submit={{ canPost: true, label: "Publish song", onSubmit: () => undefined }} /></ComposerFrame>;
}

export const RightsCollaborators: Story = {
  name: "Rights / Collaborator shares",
  render: () => <StatefulRightsStep />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add collaborator" }));
    const id = canvas.getByLabelText("Recipient 2 id");
    await userEvent.type(id, "persona-collaborator");
    await userEvent.tab();
    await userEvent.clear(canvas.getByLabelText("Recipient 1 share"));
    await userEvent.type(canvas.getByLabelText("Recipient 1 share"), "75");
    await userEvent.tab();
    await userEvent.clear(canvas.getByLabelText("Recipient 2 share"));
    await userEvent.type(canvas.getByLabelText("Recipient 2 share"), "25");
    await userEvent.tab();
    const forward = canvas.getAllByRole("button", { name: "Review" })
      .find(button => button.closest("nav") === null);
    if (forward === undefined) throw new Error("Rights footer did not render its Review action");
    await expect(forward).toBeEnabled();
  },
};

export const EnteredFromTextPost: Story = {
  name: "Entry / Audio selected in text post",
  render: () => <ComposerFrame><PostComposer {...baseComposer} /></ComposerFrame>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const file = new File([new Uint8Array([0x49, 0x44, 0x33])], "midnight-waves.mp3", { type: "audio/mpeg" });
    await userEvent.upload(canvas.getByLabelText("Upload audio"), file);
    await expect(await canvas.findByRole("heading", { name: "Song" })).toBeVisible();
    await expect(canvas.getByRole("textbox", { name: "Song title" })).toHaveValue("midnight-waves");
  },
};
