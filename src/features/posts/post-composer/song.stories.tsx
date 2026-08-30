import { createSignal } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { PostComposer } from "./post-composer";
import { baseComposer } from "./story-fixtures";
import { ComposerFrame } from "./story-helpers";
import type {
  AssetLicenseState,
  AssetRoyaltySplitState,
  ComposerReference,
  DerivativeStepState,
  MonetizationState,
  PostComposerProps,
  SongComposerState,
  SongMode,
} from "./types";

const meta = {
  title: "Flows/Posts/SongPost",
  component: PostComposer,
  args: baseComposer,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PostComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

const initialSong: SongComposerState = {
  title: "Midnight Waves",
  genre: "Electronic",
  primaryLanguage: "English",
  primaryAudioLabel: "midnight-waves.mp3",
  coverLabel: "midnight-waves-cover.svg",
  previewStartSeconds: "45",
};

const initialSplit: AssetRoyaltySplitState = {
  allocations: [
    { id: "creator", recipientKind: "creator", sharePct: 70 },
    { id: "collaborator", recipientKind: "collaborator", walletAddress: "maya.eth", sharePct: 30 },
  ],
};

const remixSources = [
  { id: "neon-harbor", title: "Neon Harbor", subtitle: "maya.eth" },
  { id: "afterglow", title: "Afterglow", subtitle: "nova.pirate" },
] satisfies ComposerReference[];

function remixStep(references: ComposerReference[], query = ""): DerivativeStepState {
  return {
    visible: true,
    required: true,
    trigger: "remix",
    query,
    searchResults: remixSources,
    references,
    sourceTermsAccepted: true,
  };
}

function StatefulSongFlow(props: {
  derivativeStep?: DerivativeStepState;
  initialStep?: 1 | 2 | 3 | 4;
  license?: AssetLicenseState;
  monetization?: MonetizationState;
  royaltySplit?: AssetRoyaltySplitState;
  songMode?: SongMode;
  submit?: PostComposerProps["submit"];
}) {
  const [song, setSong] = createSignal(initialSong);
  const [lyrics, setLyrics] = createSignal("Meet me in the red light / carry the chorus through the floor...");
  const [monetization, setMonetization] = createSignal<MonetizationState>(props.monetization ?? { visible: true, priceUsd: "4.99" });
  const [license, setLicense] = createSignal<AssetLicenseState>(props.license ?? { presetId: "commercial-remix", commercialRevSharePct: 15 });
  const [royaltySplit, setRoyaltySplit] = createSignal<AssetRoyaltySplitState>(props.royaltySplit ?? initialSplit);
  const [songMode, setSongMode] = createSignal<SongMode>(props.songMode ?? "original");
  const [derivativeStep, setDerivativeStep] = createSignal<DerivativeStepState | undefined>(props.derivativeStep);

  return (
    <ComposerFrame>
      <PostComposer
        {...baseComposer}
        derivativeStep={derivativeStep()}
        initialSongStep={props.initialStep}
        license={license()}
        lyricsValue={lyrics()}
        mode="song"
        monetization={monetization()}
        onDerivativeStepChange={setDerivativeStep}
        onLicenseChange={setLicense}
        onLyricsValueChange={setLyrics}
        onMonetizationChange={setMonetization}
        onRoyaltySplitChange={setRoyaltySplit}
        onSongChange={setSong}
        onSongModeChange={setSongMode}
        royaltySplit={royaltySplit()}
        song={song()}
        songMode={songMode()}
        submit={props.submit ?? baseComposer.submit}
      />
    </ComposerFrame>
  );
}

export const Mobile: Story = {
  name: "Song / Mobile",
  render: () => <StatefulSongFlow initialStep={1} />,
};

export const Pricing: Story = {
  name: "2. Pricing",
  render: () => <StatefulSongFlow initialStep={2} />,
};

export const Royalties: Story = {
  name: "3. Royalties / Original",
  render: () => <StatefulSongFlow initialStep={3} />,
};

export const RoyaltiesRemix: Story = {
  name: "3. Royalties / Remix / 2 sources",
  render: () => (
    <StatefulSongFlow
      derivativeStep={remixStep(remixSources)}
      initialStep={3}
      royaltySplit={{ allocations: [{ id: "creator", recipientKind: "creator", sharePct: 100 }] }}
      songMode="remix"
    />
  ),
};

export const RoyaltiesRemixOneSource: Story = {
  name: "3. Royalties / Remix / 1 source",
  render: () => (
    <StatefulSongFlow
      derivativeStep={remixStep([remixSources[0]!])}
      initialStep={3}
      royaltySplit={{ allocations: [{ id: "creator", recipientKind: "creator", sharePct: 100 }] }}
      songMode="remix"
    />
  ),
};

export const RoyaltiesRemixSearch: Story = {
  name: "3. Royalties / Remix / Search results",
  render: () => (
    <StatefulSongFlow
      derivativeStep={remixStep([remixSources[0]!], "after")}
      initialStep={3}
      royaltySplit={{ allocations: [{ id: "creator", recipientKind: "creator", sharePct: 100 }] }}
      songMode="remix"
    />
  ),
};

export const Review: Story = {
  name: "Review and post",
  render: () => <StatefulSongFlow initialStep={4} />,
};

export const EnteredFromTextPost: Story = {
  name: "Entry / Audio selected in text post",
  render: () => <ComposerFrame><PostComposer {...baseComposer} /></ComposerFrame>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const file = new File([new Uint8Array([0x49, 0x44, 0x33])], "midnight-waves.mp3", { type: "audio/mpeg" });
    await userEvent.upload(canvas.getByLabelText("Upload audio"), file);
    await expect(canvas.getByRole("heading", { name: "Song" })).toBeVisible();
    await expect(canvas.getByRole("textbox", { name: "Song title" })).toHaveValue("midnight-waves");
  },
};

export const Uploading: Story = {
  name: "Submitting / Uploading audio",
  render: () => (
    <StatefulSongFlow
      initialStep={4}
      submit={{
        canPost: true,
        loading: true,
        progress: { phase: "uploading_media", label: "Uploading audio", detail: "42%", currentIndex: 1, totalSteps: 5, display: "pipeline" },
      }}
    />
  ),
};
