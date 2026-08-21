import type { Meta, StoryObj } from "storybook-solidjs-vite";
import type { PostComposerProps } from "./types";

import { PostComposer } from "./post-composer";
import { baseComposer } from "./story-fixtures";
import { ComposerFrame, InteractiveComposer } from "./story-helpers";

const meta = {
  title: "App/Posts/PostComposer/Song",
  component: PostComposer,
  args: baseComposer,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PostComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

const song = {
  title: "Midnight Waves",
  primaryAudioLabel: "midnight-waves.mp3",
  coverLabel: "midnight-waves-cover.svg",
};

const mobileGlobals = { viewport: { value: "mobile1", isRotated: false } };

export const Original: Story = {
  name: "Original",
  render: () => (
    <ComposerFrame>
      <InteractiveComposer
        {...baseComposer}
        mode="song"
        song={song}
        titleValue="Midnight Waves"
        lyricsValue="Meet me in the red light / carry the chorus through the floor..."
      />
    </ComposerFrame>
  ),
};

export const Mobile: Story = {
  ...Original,
  name: "Mobile",
  globals: mobileGlobals,
};

export const RemixSource: Story = {
  name: "Remix / Source and terms",
  render: () => (
    <ComposerFrame>
      <InteractiveComposer
        {...baseComposer}
        mode="song"
        songMode="remix"
        song={song}
        derivativeStep={{
          visible: true,
          required: true,
          trigger: "remix",
          searchResults: [{ id: "asset-sunset", title: "Sunset Driver", subtitle: "lena-wave.pirate" }],
          references: [{ id: "asset-sunset", title: "Sunset Driver", subtitle: "lena-wave.pirate" }],
          sourceTermsAccepted: true,
          licenseSummary: {
            sourceLicense: "Commercial remix",
            upstreamRoyaltyPct: 10,
            newRemixTerms: "Commercial remix, 10%",
          },
        }}
      />
    </ComposerFrame>
  ),
};

function songVariant(overrides: Partial<PostComposerProps>) {
  return (
    <ComposerFrame>
      <PostComposer {...baseComposer} mode="song" song={song} {...overrides} />
    </ComposerFrame>
  );
}

const remixSources = [
  { id: "asset-sunset", title: "Sunset Driver", subtitle: "lena-wave.pirate" },
  { id: "asset-waves", title: "Wave Racer", subtitle: "clyeezy.pirate" },
];

function remixStateMulti() {
  return {
    visible: true,
    required: true,
    trigger: "remix" as const,
    searchResults: remixSources,
    references: remixSources,
    licenseSummary: { sourceLicense: "Commercial remix", upstreamRoyaltyPct: 10, newRemixTerms: "Commercial remix, 10%" },
  };
}

export const AnalysisMatch: Story = {
  name: "Analysis / Similarity match",
  render: () => songVariant({ submitError: "Your upload is too similar to an existing song." }),
};

function submittingSong(progress: PostComposerProps["submit"]) {
  return songVariant({ submit: { ...progress, canPost: true, loading: true } });
}

export const SubmittingUploadingAudio: Story = {
  name: "Submitting / Uploading audio",
  render: () => submittingSong({ progress: { phase: "uploading_media", label: "Uploading audio", detail: "42%", currentIndex: 1, totalSteps: 5, display: "pipeline" } }),
};

export const SubmittingAnalyzingRights: Story = {
  name: "Submitting / Analyzing rights",
  render: () => submittingSong({ progress: { phase: "checking_rights", label: "Checking rights", currentIndex: 4, totalSteps: 5, display: "pipeline" } }),
};

export const SubmittingGeneratingPreview: Story = {
  name: "Submitting / Generating preview",
  render: () => submittingSong({ progress: { phase: "processing_media", label: "Preparing preview", currentIndex: 3, totalSteps: 5, display: "pipeline" } }),
};

export const SubmittingCreatingListing: Story = {
  name: "Submitting / Creating listing",
  render: () => submittingSong({ progress: { phase: "creating_listing", label: "Creating listing", currentIndex: 5, totalSteps: 6, display: "pipeline" } }),
};

export const RetryableFailure: Story = {
  name: "Submitting / Retryable failure",
  render: () => songVariant({ submit: { canPost: true, error: "The audio service is unavailable. Try again.", label: "Retry post" } }),
};

export const PostPublished: Story = {
  name: "Submitting / Post published",
  render: () => songVariant({ submit: { canPost: true, progress: { phase: "done", label: "Post published", currentIndex: 5, totalSteps: 5, display: "activity" } } }),
};

export const VisibilityModalOpen: Story = {
  name: "Visibility / Modal open",
  render: () => songVariant({ initialOpenPanel: "visibility" }),
};

export const VisibilityModalOpenMobile: Story = {
  ...VisibilityModalOpen,
  name: "Visibility / Modal open (mobile)",
  globals: mobileGlobals,
};

export const LicenseSheetOpen: Story = {
  name: "License / Sheet open",
  render: () => songVariant({ initialOpenPanel: "license" }),
};

export const LicenseSheetOpenMobile: Story = {
  ...LicenseSheetOpen,
  name: "License / Sheet open (mobile)",
  globals: mobileGlobals,
};

export const CollaboratorsSheet: Story = {
  name: "Collaborators / Sheet",
  render: () => songVariant({
    initialOpenPanel: "collaborators",
    royaltySplit: { allocations: [
      { id: "creator", recipientKind: "creator", sharePct: 70 },
      { id: "collaborator-1", recipientKind: "collaborator", recipientId: "profile-sunset", displayHandle: "lena-wave.pirate", sharePct: 30 },
    ] },
    onResolveCollaboratorHandle: async () => null,
  }),
};

export const CollaboratorsSheetMobile: Story = {
  ...CollaboratorsSheet,
  name: "Collaborators / Sheet (mobile)",
  globals: mobileGlobals,
};

export const SongCardMarkAsRemix: Story = {
  name: "Song card / Mark as remix",
  render: () => songVariant({ initialRemixSourceOpen: false }),
};

export const SongCardMarkAsRemixMobile: Story = {
  ...SongCardMarkAsRemix,
  name: "Song card / Mark as remix (mobile)",
  globals: mobileGlobals,
};

export const SongCardRemixSelected: Story = {
  name: "Song card / Remix selected",
  render: () => songVariant({
    songMode: "remix",
    derivativeStep: remixStateMulti(),
  }),
};

export const SongCardRemixSelectedMobile: Story = {
  ...SongCardRemixSelected,
  name: "Song card / Remix selected (mobile)",
  globals: mobileGlobals,
};

export const RequiredSheetTitleOnly: Story = {
  name: "Required / Title only",
  render: () => songVariant({
    song: { primaryAudioLabel: "midnight-waves.mp3" },
    initialRequiredSheetOpen: true,
  }),
};

export const RequiredSheetTitleOnlyMobile: Story = {
  ...RequiredSheetTitleOnly,
  name: "Required / Title only (mobile)",
  globals: mobileGlobals,
};

export const WithCharityContribution: Story = {
  name: "Charity / Contribution",
  render: () => songVariant({
    charityPartner: { partnerId: "partner-1", displayName: "Community Arts Fund" },
    charityContribution: { percentagePct: 5, userConfigured: true },
    initialOpenPanel: "collaborators",
  }),
};
