import { describe, expect, test } from "bun:test";

import {
  archiveCopy,
  isArchiveSaving,
  type CommunityArchiveSubmitState,
} from "./archive-page-model";

describe("archive page model", () => {
  test("keeps the React contract copy and four deterministic effects", () => {
    expect(archiveCopy.title).toBe("Danger zone");
    expect(archiveCopy.effects).toEqual([
      "Hides the community from discovery and search.",
      "Returns 404 for the public community page.",
      "Blocks new posts, comments, joins, listings, live rooms, and purchases.",
      "Keeps all existing content, members, and settings intact for restore.",
    ]);
    expect(Object.isFrozen(archiveCopy.effects)).toBe(false);
    expect(archiveCopy.effects).toHaveLength(4);
  });

  test("derives saving only from the controlled submit state", () => {
    const states: CommunityArchiveSubmitState[] = [
      { kind: "idle" },
      { kind: "saving" },
      { kind: "error", message: "Try again" },
    ];
    expect(states.map(isArchiveSaving)).toEqual([false, true, false]);
  });
});
