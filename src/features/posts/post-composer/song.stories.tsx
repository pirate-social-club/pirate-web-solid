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
  genre: "Electronic",
  primaryLanguage: "English",
  primaryAudioLabel: "midnight-waves.mp3",
  coverLabel: "midnight-waves-cover.svg",
};
export const Original: Story = {
  name: "Original",
  render: () => (
    <ComposerFrame>
      <InteractiveComposer
        {...baseComposer}
        mode="song"
        songMode="original"
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
  globals: { viewport: { value: "mobile1", isRotated: false } },
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

export const LicenseSettings: Story = {
  name: "License and royalties",
  render: () => (
    <ComposerFrame>
      <PostComposer
        {...baseComposer}
        mode="song"
        song={song}
        license={{ presetId: "commercial-remix", commercialRevSharePct: 10 }}
        monetization={{ visible: true, priceUsd: "4.99", regionalPricingAvailable: true }}
        initialOpenPanel="access-and-rights"
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

export const LicenseNonCommercial: Story = {
  name: "License / Non-commercial remixing",
  render: () => songVariant({ license: { presetId: "non-commercial" }, initialOpenPanel: "access-and-rights" }),
};

export const LicenseCommercialUse: Story = {
  name: "License / Commercial use",
  render: () => songVariant({ license: { presetId: "commercial-use" }, monetization: { visible: true, priceUsd: "4.99" }, initialOpenPanel: "access-and-rights" }),
};

export const LicenseCommercialRemix: Story = {
  name: "License / Commercial remix",
  render: () => songVariant({ license: { presetId: "commercial-remix", commercialRevSharePct: 10 }, initialOpenPanel: "access-and-rights" }),
};

const remixSource = { id: "asset-sunset", title: "Sunset Driver", subtitle: "lena-wave.pirate" };

function remixState(sourceTermsAccepted: boolean) {
  return {
    visible: true,
    required: true,
    trigger: "remix" as const,
    searchResults: [remixSource],
    references: [remixSource],
    sourceTermsAccepted,
    licenseSummary: { sourceLicense: "Commercial remix", upstreamRoyaltyPct: 10, newRemixTerms: "Commercial remix, 10%" },
  };
}

export const RemixSourceTermsBlocked: Story = {
  name: "Rights / Source terms blocked",
  render: () => songVariant({ songMode: "remix", derivativeStep: remixState(false) }),
};

export const RemixSourceTermsAccepted: Story = {
  name: "Rights / Source terms accepted",
  render: () => songVariant({ songMode: "remix", derivativeStep: remixState(true) }),
};

export const RemixSwitchedBackToOriginal: Story = {
  name: "Rights / Switched back to original",
  render: () => songVariant({ songMode: "original" }),
};

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

export const PaidUnlock: Story = {
  name: "Access / Paid unlock",
  render: () => songVariant({ monetization: { visible: true, priceUsd: "4.99" }, license: { presetId: "commercial-use" }, initialOpenPanel: "access-and-rights" }),
};

export const RoyaltySplitMultiRecipient: Story = {
  name: "Royalties / Multiple recipients",
  render: () => songVariant({ royaltySplit: { allocations: [{ id: "creator", recipientKind: "creator", sharePct: 70 }, { id: "collaborator", recipientKind: "collaborator", sharePct: 30 }] }, initialOpenPanel: "access-and-rights" }),
};

export const PaidUnlockWithVinyl: Story = {
  name: "Access / Paid unlock with vinyl",
  render: () => songVariant({ monetization: { visible: true, priceUsd: "9.99", vinylReleaseUrl: "https://elasticstage.com/release" }, initialOpenPanel: "access-and-rights" }),
};

export const PaidUnlockRegionalPricing: Story = {
  name: "Access / Regional pricing",
  render: () => songVariant({ monetization: { visible: true, priceUsd: "4.99", regionalPricingAvailable: true, regionalPricingEnabled: true }, regionalPricingPreview: { defaultTierKey: "high", tiers: [{ tierKey: "high", displayName: "High income", adjustmentType: "multiplier", adjustmentValue: 1, countryCodes: ["US", "GB"] }, { tierKey: "standard", displayName: "Standard", adjustmentType: "multiplier", adjustmentValue: 0.65, countryCodes: ["BR", "GE"] }] }, initialOpenPanel: "access-and-rights" }),
};

export const WithCharityContribution: Story = {
  name: "Charity / Contribution",
  render: () => songVariant({ monetization: { visible: true, priceUsd: "4.99" }, charityPartner: { partnerId: "partner-1", displayName: "Community Arts Fund" }, charityContribution: { percentagePct: 5, userConfigured: true }, initialOpenPanel: "access-and-rights" }),
};
