type VideoFeedCapability = "unknown" | "ready" | "locked" | "processing" | "failed" | "unavailable";

export interface VideoFeedItem {
  booking?: {
    basePriceCents: number;
    currency: "USDC";
    hasAvailableSlot: boolean;
    hostUserId: string;
    startingPriceCents: number | null;
  };
  boostEligibility?: "eligible" | "unavailable";
  communityId?: string;
  id: string;
  publisher: {
    avatarSrc?: string;
    handle: string;
    href?: string;
    external?: boolean;
    kind: "community" | "profile";
    relationship?:
      | { kind: "follow"; ownProfile: boolean; targetUserId: string; targetWalletAddress: string }
      | { active: boolean; disabled?: boolean; kind: "join"; label: string; pending?: boolean };
  };
  caption?: string;
  captionDir?: "ltr" | "rtl" | "auto";
  captionLang?: string;
  commentCount: number;
  interactionGate?: "open" | "membership_required";
  karaoke: VideoFeedCapability;
  learningGate?: "allowed" | "age_proof_required";
  downvoted?: boolean;
  likeCount: number;
  liked?: boolean;
  media: { orientation: "portrait" | "landscape"; posterSrc?: string; src?: string };
  shareActions?: Array<{ key: string; label: string }>;
  translation?: {
    originalCaption: string;
    originalDir?: "ltr" | "rtl" | "auto";
    originalLang?: string;
    showOriginalLabel: string;
    showTranslationLabel: string;
  };
  rewards?: { karaoke?: { amountLabel?: string }; study?: { amountLabel?: string } };
  song?: {
    artworkSrc?: string;
    artist: string;
    karaokeHref?: string;
    songHref?: string;
    sourcePostId?: string;
    studyHref?: string;
    title: string;
  };
  study: VideoFeedCapability;
  viewerState?: "allowed" | "age_proof_required";
}
