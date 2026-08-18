export type ReferenceLinkPlatform =
  | "musicbrainz"
  | "genius"
  | "spotify"
  | "apple_music"
  | "wikipedia"
  | "instagram"
  | "tiktok"
  | "x"
  | "official_website"
  | "youtube"
  | "bandcamp"
  | "soundcloud"
  | "discord"
  | "other";

export interface CommunityLinkEditorItem {
  id: string;
  label: string;
  platform: ReferenceLinkPlatform;
  url: string;
  verified?: boolean;
}

export interface PlatformOption {
  label: string;
  value: ReferenceLinkPlatform;
}

export const PLATFORM_OPTIONS: readonly PlatformOption[] = [
  { value: "official_website", label: "Website" },
  { value: "spotify", label: "Spotify" },
  { value: "youtube", label: "YouTube" },
  { value: "instagram", label: "Instagram" },
  { value: "x", label: "X" },
  { value: "discord", label: "Discord" },
  { value: "tiktok", label: "TikTok" },
  { value: "apple_music", label: "Apple Music" },
  { value: "bandcamp", label: "Bandcamp" },
  { value: "soundcloud", label: "SoundCloud" },
  { value: "musicbrainz", label: "MusicBrainz" },
  { value: "genius", label: "Genius" },
  { value: "wikipedia", label: "Wikipedia" },
  { value: "other", label: "Other" },
];

/** Return the first deterministic id not already owned by the controlled list. */
export function nextLinkDraftId(existingIds: readonly string[]): string {
  const owned = new Set(existingIds);
  let index = 1;
  while (owned.has(`draft-${index}`)) index += 1;
  return `draft-${index}`;
}

export function createEmptyCommunityLinkEditorItem(
  existingIds: readonly string[] = [],
): CommunityLinkEditorItem {
  return {
    id: nextLinkDraftId(existingIds),
    label: "",
    platform: "official_website",
    url: "",
    verified: false,
  };
}

export function linkSaveDisabled(links: readonly CommunityLinkEditorItem[]): boolean {
  return links.some((link) => link.url.trim().length === 0);
}
