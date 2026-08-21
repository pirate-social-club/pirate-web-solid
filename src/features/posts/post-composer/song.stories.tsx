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

function songVariant(overrides: Partial<PostComposerProps>) {
  return (
    <ComposerFrame>
      <PostComposer {...baseComposer} mode="song" song={song} {...overrides} />
    </ComposerFrame>
  );
}

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

export const StepSong: Story = {
  name: "Step 1 / Song",
  render: () => songVariant({ initialStep: "song" }),
};

export const StepSongMobile: Story = {
  ...StepSong,
  name: "Step 1 / Song (mobile)",
  globals: mobileGlobals,
};

export const StepLyrics: Story = {
  name: "Step 2 / Lyrics",
  render: () => songVariant({ initialStep: "lyrics" }),
};

export const StepLyricsMobile: Story = {
  ...StepLyrics,
  name: "Step 2 / Lyrics (mobile)",
  globals: mobileGlobals,
};

export const StepRights: Story = {
  name: "Step 3 / Rights",
  render: () => songVariant({ initialStep: "rights" }),
};

export const StepRightsMobile: Story = {
  ...StepRights,
  name: "Step 3 / Rights (mobile)",
  globals: mobileGlobals,
};

export const StepReview: Story = {
  name: "Step 4 / Review",
  render: () => songVariant({ initialStep: "review" }),
};

export const StepReviewMobile: Story = {
  ...StepReview,
  name: "Step 4 / Review (mobile)",
  globals: mobileGlobals,
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
