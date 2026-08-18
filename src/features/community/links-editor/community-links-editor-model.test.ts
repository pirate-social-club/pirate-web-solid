import { describe, expect, test } from "bun:test";

import {
  PLATFORM_OPTIONS,
  createEmptyCommunityLinkEditorItem,
  linkSaveDisabled,
  nextLinkDraftId,
} from "./community-links-editor-model";

describe("community links editor model", () => {
  test("allocates stable draft ids without randomness", () => {
    expect(nextLinkDraftId([])).toBe("draft-1");
    expect(nextLinkDraftId(["draft-1", "draft-3"])).toBe("draft-2");
    expect(createEmptyCommunityLinkEditorItem(["draft-1"])).toEqual({
      id: "draft-2",
      label: "",
      platform: "official_website",
      url: "",
      verified: false,
    });
  });

  test("disables save exactly when a controlled URL is blank after trim", () => {
    expect(linkSaveDisabled([])).toBe(false);
    expect(linkSaveDisabled([{ id: "link-1", label: "", platform: "spotify", url: "  " }])).toBe(true);
    expect(linkSaveDisabled([{ id: "link-1", label: "", platform: "spotify", url: "https://example.com" }])).toBe(false);
  });

  test("preserves the React platform enum and ordering", () => {
    expect(PLATFORM_OPTIONS.map((option) => option.label)).toEqual([
      "Website", "Spotify", "YouTube", "Instagram", "X", "Discord", "TikTok",
      "Apple Music", "Bandcamp", "SoundCloud", "MusicBrainz", "Genius", "Wikipedia", "Other",
    ]);
    expect(PLATFORM_OPTIONS.map((option) => option.value)).toContain("official_website");
  });
});
