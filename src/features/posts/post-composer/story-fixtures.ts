import type { PostComposerProps, SubmitProgress } from "./types";

export const baseComposer: PostComposerProps = {
  mode: "text",
  availableTabs: ["text", "image", "video", "link", "song", "live", "file"],
  canCreateSongPost: true,
  titleValue: "What is the best Ye opener?",
  textBodyValue:
    "Looking back through the discography, there are so many iconic intro tracks. What is the best Ye opener?",
  identity: {
    allowAnonymousIdentity: true,
    allowQualifiersOnAnonymousPosts: true,
    identityMode: "public",
    publicHandle: "saint-pablo.pirate",
    realNameLabel: "clyeezy.pirate",
    reputationLabel: "Rep: 1.2k",
    anonymousLabel: "anon_amber-anchor-00",
    availableQualifiers: [
      {
        qualifierId: "qlf_unique_human",
        label: "Unique Human",
        description: "Verified uniqueness",
        sensitivityLevel: "low",
        sourceProvider: "self",
      },
      {
        qualifierId: "qlf_age_over_18",
        label: "18+",
        description: "Adult",
        sensitivityLevel: "low",
        sourceProvider: "self",
      },
    ],
    selectedQualifierIds: [],
    helpText: "Optional qualifiers add authority to a post.",
  },
  submit: {
    canPost: true,
    label: "Post",
    onSubmit: () => undefined,
  },
};

function progress(input: Partial<SubmitProgress> & Pick<SubmitProgress, "phase" | "label">): SubmitProgress {
  return {
    currentIndex: 2,
    totalSteps: 5,
    display: "pipeline",
    ...input,
  };
}

export const imageProgress = progress({
  phase: "uploading_media",
  label: "Uploading image",
  detail: "45%",
  currentIndex: 1,
  totalSteps: 2,
  display: "activity",
});

export const videoProgress = progress({
  phase: "processing_media",
  label: "Preparing video",
  currentIndex: 3,
  totalSteps: 6,
});

export const doneProgress = progress({
  phase: "done",
  label: "Post published",
  currentIndex: 5,
  totalSteps: 5,
  display: "activity",
});
