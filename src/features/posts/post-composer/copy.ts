// Static English copy for the post composer. The React version reads
// `getLocaleMessages(locale, "routes").createPost`; the Solid locale catalogs
// do not carry the createPost namespace, so the composer owns its copy here
// (values lifted from web/src/locales/en/routes.json). Callers may override
// individual groups via `PostComposerProps.copy` later if a localized catalog
// lands; stories always use these defaults so they stay deterministic.

import type { ComposerStep } from "./types";

export interface ComposerCopy {
  actions: {
    back: string;
    continue: string;
    post: string;
    publish: string;
    nextTo: (step: string) => string;
  };
  steps: Record<ComposerStep, string>;
  lyrics: {
    instrumentalToggle: string;
    instrumentalToggleNote: string;
    stemNote: string;
  };
  audience: {
    community: string;
    public: string;
  };
  access: {
    paidUnlock: string;
    payToAccess: string;
    useRegionalPricing: string;
  };
  assetLicense: {
    song: Record<string, string>;
    video: Record<string, string>;
  };
  buttons: {
    chooseFile: string;
    clear: string;
    replace: string;
  };
  common: {
    loading: string;
  };
  derivative: {
    acceptSourceTerms: string;
    licenseNewRemixTerms: string;
    searchSourceTracks: string;
  };
  empty: {
    noOptionalQualifiers: string;
    noQualifiers: string;
    noMatches: string;
    noReferences: string;
    noSongs: string;
  };
  fields: Record<string, string>;
  identitySheet: {
    agentRowDescription: string;
    anonymousRowDescription: string;
    publicRowDescription: string;
    qualifierCount: (count: number) => string;
    qualifiersApply: string;
    qualifiersTitle: string;
    title: string;
  };
  publishChips: {
    accessRightsTitle: string;
    audienceTitle: string;
    audienceMembersOnly: string;
    audiencePublic: string;
    done: string;
    visibilityTitle: string;
  };
  rights: {
    songKindLabel: string;
    licenseSheetTitle: string;
    licenseTitles: Record<string, string>;
    payoutLabel: string;
    payoutSolo: string;
    payoutSplit: (count: number) => string;
    done: string;
    addCollaborators: string;
  };
  identity: {
    addQualifiers: string;
  };
  labels: {
    source: string;
  };
  live: Record<string, string>;
  none: string;
  placeholders: Record<string, string>;
  requiredFieldsLegend: string;
  sections: Record<string, string>;
  setlist: {
    cannotFindTrack: string;
    hideManualDetails: string;
    searchSongs: string;
  };
  songModes: {
    original: string;
    remix: string;
  };
  tabs: Record<"text" | "image" | "video" | "link" | "song" | "live", string>;
  upload: {
    artworkHelp: string;
    cover: string;
    noFileSelected: string;
    squareArtwork: string;
  };
}

export const defaultComposerCopy: ComposerCopy = {
  actions: {
    back: "Back",
    continue: "Continue",
    post: "Post",
    publish: "Publish",
    nextTo: (step) => `Next: ${step}`,
  },
  steps: {
    write: "Write",
    song: "Song",
    lyrics: "Lyrics",
    rights: "Rights",
    review: "Review",
    details: "Details",
  },
  lyrics: {
    instrumentalToggle: "Instrumental — no lyrics",
    instrumentalToggleNote: "An instrumental has no lyrics, so Sing won't be available for it.",
    stemNote: "Sing needs lyrics. The instrumental stem is what plays behind them. Stems don't submit yet.",
  },
  audience: {
    community: "Community",
    public: "Public",
  },
  access: {
    paidUnlock: "Paid unlock",
    payToAccess: "Pay to access",
    useRegionalPricing: "Use community regional pricing",
  },
  assetLicense: {
    song: {
      "non-commercial": "Non-commercial remixing",
      "non-commercialDescription": "Others can publish non-commercial remixes with attribution; commercial releases are prohibited.",
      "commercial-use": "Commercial use",
      "commercial-useDescription": "Others can monetize with the original song with attribution; remixes are prohibited.",
      "commercial-remix": "Commercial remix",
      "commercial-remixDescription": "Others can monetize and publish remixes with attribution.",
      revenueShare: "Revenue share",
    },
    video: {
      "non-commercial": "Non-commercial remixing",
      "non-commercialDescription": "Others can publish non-commercial derivatives with attribution; commercial releases are prohibited.",
      "commercial-use": "Commercial use",
      "commercial-useDescription": "Others can monetize with the original video with attribution; derivatives are prohibited.",
      "commercial-remix": "Commercial derivatives",
      "commercial-remixDescription": "Others can monetize and publish derivative videos with attribution.",
      revenueShare: "Revenue share",
    },
  },
  buttons: {
    chooseFile: "Choose file",
    clear: "Clear",
    replace: "Replace",
  },
  common: {
    loading: "Loading...",
  },
  derivative: {
    acceptSourceTerms: "I accept the source remix terms.",
    licenseNewRemixTerms: "New remix terms",
    searchSourceTracks: "Search remix-eligible source tracks",
  },
  empty: {
    noOptionalQualifiers: "No optional qualifiers are available for this community.",
    noQualifiers: "No qualifiers found.",
    noMatches: "No matches",
    noReferences: "No remix sources attached yet.",
    noSongs: "No songs found.",
  },
  fields: {
    canvasVideo: "Canvas video (9:16)",
    coverArt: "Cover art",
    coverFrame: "Cover frame",
    genre: "Genre",
    geniusAnnotations: "Genius annotations",
    instrumentalStem: "Instrumental stem",
    lyrics: "Lyrics",
    price: "Price",
    primaryLanguage: "Primary language",
    secondaryLanguage: "Secondary language",
    song: "Song",
    unlockPriceUsd: "Unlock price (USD)",
    vocalStem: "Vocal stem",
  },
  identity: {
    addQualifiers: "Add qualifiers",
  },
  identitySheet: {
    agentRowDescription: "Post from your agent identity",
    anonymousRowDescription: "Same identity across this community",
    publicRowDescription: "Your public profile",
    qualifierCount: (count) => `${count} ${count === 1 ? "qualifier" : "qualifiers"}`,
    qualifiersApply: "Applies to this post only.",
    qualifiersTitle: "Qualifiers",
    title: "Post as",
  },
  publishChips: {
    accessRightsTitle: "Access & rights",
    audienceTitle: "Who can see this?",
    audienceMembersOnly: "Members only",
    audiencePublic: "Public",
    done: "Done",
    visibilityTitle: "Visibility",
  },
  rights: {
    songKindLabel: "This song is",
    licenseSheetTitle: "Others can",
    licenseTitles: {
      "non-commercial": "Others can remix it, not sell it",
      "commercial-use": "Use it commercially, not remix it",
      "commercial-remix": "Remix it and sell it, 10% to me",
    },
    payoutLabel: "Payout",
    payoutSolo: "You keep 100%",
    payoutSplit: (count) => `Split with ${count} collaborator${count === 1 ? "" : "s"}`,
    done: "Done",
    addCollaborators: "Add collaborators",
  },
  labels: {
    source: "Source",
  },
  live: {
    roomKind: "Room kind",
    access: "Access",
    visibility: "Visibility",
    guestPerformer: "Guest performer",
    collaboratorPlaceholder: "Search for a collaborator",
    collaboratorNote: "Invite a collaborator for this duet session.",
    performerAllocations: "Performer allocations",
    soloProceedsDescription: "The host receives 100% of performer-side proceeds.",
    duetProceedsDescription: "Split performer-side proceeds between host and collaborator.",
    hostLabel: "Host",
    guestLabel: "Guest",
    youLabel: "You",
    collaboratorLabel: "Collaborator",
    allocationsError: "Allocations must sum to 100%",
    setlistTitle: "Setlist",
    addSong: "Add song",
    emptySetlist: "No songs yet. Add at least one song before going live.",
    roomKindSolo: "Solo",
    roomKindDuet: "Duet",
    accessFree: "Free",
    accessGated: "Gated",
    accessPaid: "Paid",
    audienceGate: "Audience gate",
    audienceGateCommunityMembers: "Community members",
    audienceGatePurchaseEntitlement: "Buyers of selected songs",
    audienceGatePurchaseEntitlementEmpty: "Select catalog songs in the setlist before using buyer access.",
    visibilityPublic: "Public",
    visibilityUnlisted: "Unlisted",
    paidVisibilityNote: "Paid livestreams must be public. Select Public to continue.",
    scheduleForLater: "Schedule for later",
    startTime: "Start time",
    startTimeNote: "Required for scheduled live events.",
    recordThisLivestream: "Record this livestream",
    recordThisLivestreamNote: "Creates a private replay draft after the stream ends.",
    eventCover: "Event cover",
    eventCoverUpload: "Upload event cover",
    eventCoverHelp: "Upload a 16:9 event cover. Feed, preview, and event page show it wide.",
    storeUrl: "Store URL",
    storeUrlPlaceholder: "https://store.example.com",
    storeLabel: "Store label",
    storeLabelPlaceholder: "Event merch",
  },
  none: "None",
  placeholders: {
    artist: "Artist",
    body: "Write your post",
    geniusAnnotationsUrl: "https://genius.com/...",
    lyrics: "Paste lyrics",
    optional: "Optional",
    selectGenre: "Select genre",
    selectLanguage: "Select language",
    songSearch: "Search your uploaded songs",
    songTitle: "Song title",
    sourceTrackSearch: "Search remix-eligible source tracks",
    title: "Title",
    unlockPrice: "0",
  },
  requiredFieldsLegend: "Required fields are marked with *",
  sections: {
    postAs: "Post as",
    sourceTrack: "Remix source",
    license: "License",
  },
  setlist: {
    cannotFindTrack: "Can't find the track?",
    hideManualDetails: "Hide manual details",
    searchSongs: "Search songs for setlist item",
  },
  songModes: {
    original: "Original",
    remix: "Remix",
  },
  tabs: {
    image: "Image",
    link: "Link",
    live: "Live",
    song: "Song",
    text: "Text",
    video: "Video",
  },
  upload: {
    artworkHelp: "Shows in feed, release, and player surfaces.",
    cover: "Cover",
    noFileSelected: "No file selected",
    squareArtwork: "Upload square artwork",
  },
};

interface ComposerTabLabels {
  file: string;
  image: string;
  link: string;
  live: string;
  song: string;
  text: string;
  video: string;
}

export function buildComposerTabLabels(copy: ComposerCopy): ComposerTabLabels {
  return { ...copy.tabs, file: "File" };
}
