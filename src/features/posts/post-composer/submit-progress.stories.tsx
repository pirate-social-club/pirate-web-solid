import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { PostComposer } from "./post-composer";
import { baseComposer, doneProgress, imageProgress, videoProgress } from "./story-fixtures";
import { ComposerFrame } from "./story-helpers";
import type { ComposerTab, SubmitProgress } from "./types";

const meta = {
  title: "Parts/Posts/SubmitProgress",
  component: PostComposer,
  args: baseComposer,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PostComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

function progressStory(progress: SubmitProgress, mode: ComposerTab = "image") {
  return (
    <ComposerFrame>
      <PostComposer
        {...baseComposer}
        mode={mode}
        submit={{
          canPost: true,
          loading: progress.phase !== "done",
          progress,
        }}
      />
    </ComposerFrame>
  );
}

export const ImageUploadingActivity: Story = {
  name: "Activity / Image uploading",
  render: () => progressStory(imageProgress),
};

export const Mobile: Story = {
  ...ImageUploadingActivity,
  name: "Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const TextPublishingActivity: Story = {
  name: "Activity / Text publishing",
  render: () => progressStory({
    phase: "publishing_post",
    label: "Publishing",
    currentIndex: 2,
    totalSteps: 2,
    display: "activity",
  }, "text"),
};

export const SongPendingBundleActivity: Story = {
  name: "Activity / Song pre-uploaded bundle",
  render: () => progressStory({
    phase: "checking_registration",
    label: "Checking registration",
    currentIndex: 3,
    totalSteps: 3,
    display: "activity",
  }, "song"),
};

export const SongPipelineCounter: Story = {
  name: "Pipeline / Song analyzing",
  render: () => progressStory({
    phase: "processing_media",
    label: "Analyzing song",
    currentIndex: 5,
    totalSteps: 8,
    display: "pipeline",
  }, "song"),
};

export const VideoProcessingPipeline: Story = {
  name: "Pipeline / Video processing",
  render: () => progressStory(videoProgress, "video"),
};

export const VideoUploadingWithPercent: Story = {
  name: "Pipeline / Video uploading",
  render: () => progressStory({
    phase: "uploading_media",
    label: "Uploading video",
    detail: "63%",
    currentIndex: 2,
    totalSteps: 6,
    display: "pipeline",
  }, "video"),
};

export const DonePublished: Story = {
  name: "Done / Post published",
  render: () => progressStory(doneProgress),
};

export const ErrorRetry: Story = {
  name: "Error / Retry",
  render: () => (
    <ComposerFrame>
      <PostComposer
        {...baseComposer}
        submit={{
          canPost: true,
          error: "The media service is unavailable. Try again.",
          label: "Retry post",
        }}
      />
    </ComposerFrame>
  ),
};
