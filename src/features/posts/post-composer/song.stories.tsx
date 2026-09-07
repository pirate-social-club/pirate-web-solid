import { createSignal } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { PostComposer } from "./post-composer";
import { baseComposer } from "./story-fixtures";
import { ComposerFrame } from "./story-helpers";
import type { AssetLicenseState, AssetRoyaltySplitState, SongComposerState } from "./types";

const meta = { title: "Flows/Posts/SongPost", component: PostComposer, args: baseComposer,
  parameters: { layout: "fullscreen" } } satisfies Meta<typeof PostComposer>;
export default meta;
type Story = StoryObj<typeof meta>;

function StatefulSongFlow(props: { initialStep?: 1 | 2 | 3 | 4 }) {
  const [song, setSong] = createSignal<SongComposerState>({ title: "Midnight Waves", lyricsEditorState: "ready" });
  const [lyrics, setLyrics] = createSignal("");
  const [license, setLicense] = createSignal<AssetLicenseState>({ presetId: "non-commercial" });
  const [royaltySplit, setRoyaltySplit] = createSignal<AssetRoyaltySplitState>({ allocations: [
    { id: "creator", recipientKind: "creator", recipientId: "persona-creator", shareBps: 10_000, sharePct: 100 },
  ] });
  return <ComposerFrame><PostComposer {...baseComposer} currentPersonaId="persona-creator"
    initialSongStep={props.initialStep} mode="song" song={song()} onSongChange={setSong}
    lyricsValue={lyrics()} onLyricsValueChange={setLyrics} license={license()} onLicenseChange={setLicense}
    royaltySplit={royaltySplit()} onRoyaltySplitChange={setRoyaltySplit} /></ComposerFrame>;
}
export const Mobile: Story = { name: "1. Song", render: () => <StatefulSongFlow initialStep={1} /> };
export const Lyrics: Story = { name: "2. Lyrics after upload", render: () => <StatefulSongFlow initialStep={2} /> };
export const Royalties: Story = { name: "3. Royalties", render: () => <StatefulSongFlow initialStep={3} />,
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
    await expect(canvas.getByRole("button", { name: /^Review$/ })).toBeEnabled();
  } };
export const Review: Story = { name: "4. Confirm and post", render: () => <StatefulSongFlow initialStep={4} /> };
export const EnteredFromTextPost: Story = {
  name: "Entry / Audio selected in text post",
  render: () => <ComposerFrame><PostComposer {...baseComposer} /></ComposerFrame>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const file = new File([new Uint8Array([0x49, 0x44, 0x33])], "midnight-waves.mp3", { type: "audio/mpeg" });
    await userEvent.upload(canvas.getByLabelText("Upload audio"), file);
    await expect(await canvas.findByRole("heading", { name: "Song" })).toBeVisible();
    await expect(canvas.getByRole("textbox", { name: "Song title" })).toHaveValue("midnight-waves");
    await expect(canvas.getByLabelText("Song preview")).toHaveAttribute("controls");
  },
};
