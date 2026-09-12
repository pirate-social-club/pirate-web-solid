import type { PostComposerProps } from "./types";

export const baseComposer: PostComposerProps = {
  mode: "text",
  // Matches the capabilities the production CreatePostDialog declares.
  availableCapabilities: ["text", "song", "video"],
  canCreateSongPost: true,
  titleValue: "What is the best album opener?",
  textBodyValue:
    "Looking back through the discography, there are so many iconic intro tracks. Which one still holds up?",
  identity: {
    allowAnonymousIdentity: true,
    allowQualifiersOnAnonymousPosts: true,
    identityMode: "public",
    publicHandle: "creator.pirate",
    realNameLabel: "creator.pirate",
    reputationLabel: "Rep: 1.2k",
    anonymousLabel: "anon_amber-anchor-00",
    availableQualifiers: [],
    selectedQualifierIds: [],
    helpText: "Optional qualifiers add authority to a post.",
  },
  submit: {
    canPost: true,
    label: "Post",
    onSubmit: () => undefined,
  },
};
