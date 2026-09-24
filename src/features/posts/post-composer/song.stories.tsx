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
    initialSongStep={2} mode="song" song={song()} onSongChange={setSong}
    recipientProfiles={[
      { personaId: "persona-creator", displayName: "Creator", handle: "creator.pirate" },
      { personaId: "persona-collaborator", displayName: "Collaborator", handle: "collaborator.pirate" },
    ]}
    lyricsValue={lyrics()} onLyricsValueChange={setLyrics} license={license()} onLicenseChange={setLicense}
    royaltySplit={royaltySplit()} onRoyaltySplitChange={setRoyaltySplit}
    submit={{ canPost: true, label: "Post song", onSubmit: () => undefined }} /></ComposerFrame>;
}

export const RightsCollaborators: Story = {
  name: "Rights / Collaborator shares",
  render: () => <StatefulRightsStep />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Add collaborator" }));
    const sheet = await body.findByRole("dialog");
    const collaborator = await within(sheet).findByRole("button", { name: /collaborator\.pirate/ });
    await userEvent.click(collaborator);
    const share = await within(sheet).findByLabelText("Share for Collaborator");
    await userEvent.clear(share);
    await userEvent.type(share, "25");
    await userEvent.tab();
    await userEvent.click(await within(sheet).findByRole("button", { name: "Add" }));
    await expect(await body.findByText("75%")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Continue" })).toBeEnabled();
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
