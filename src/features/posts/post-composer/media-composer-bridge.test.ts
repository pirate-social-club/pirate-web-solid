import { describe, expect, test } from "bun:test";

import type { MediaSubmissionSnapshot } from "../media-submission/contracts";
import type { MediaSubmissionCoordinator } from "../media-submission/coordinator";
import { projectSnapshotIntoSongComposer, submitComposerLyrics } from "./media-composer-bridge";

function snapshot(
  lyricsState: MediaSubmissionSnapshot["lyrics_state"],
  audioRevision = 1,
): MediaSubmissionSnapshot {
  return {
    submission_id: "sub-1",
    author_persona: { persona_id: "persona-1", object: "persona", display_name: null, avatar_ref: null, primary_public_handle: null },
    href: "/media-post-submissions/sub-1",
    track: "song",
    creation_revision: 2,
    audio_revision: audioRevision,
    lyrics_state: lyricsState,
    updated_at: "2026-08-26T00:00:00Z",
    status: "processing",
    phase: "analysis",
  };
}

describe("post composer media bridge", () => {
  test("keeps the lyrics editor hidden before audio revision one", () => {
    expect(projectSnapshotIntoSongComposer(snapshot({
      current: { status: "not_bound" },
    }, 0))).toEqual({ song: { lyricsEditorState: "hidden" } });
  });

  test("unlocks an empty author-owned lyrics editor", () => {
    expect(projectSnapshotIntoSongComposer(snapshot({
      current: { status: "not_bound" },
    }))).toEqual({ song: { lyricsEditorState: "ready" } });
  });

  test("keeps lyrics-free publication out of the editor", () => {
    expect(projectSnapshotIntoSongComposer(snapshot({
      current: { status: "no_lyrics" },
    }))).toEqual({ song: { lyricsEditorState: "no_lyrics" } });
  });

  test("binds first author text as a paste", async () => {
    const source = snapshot({
      current: { status: "not_bound" },
    });
    const modes: string[] = [];
    const coordinator = {
      bindLyrics: async (_lyrics: string, mode: string) => {
        modes.push(mode);
        return source;
      },
    } satisfies Pick<MediaSubmissionCoordinator, "bindLyrics">;

    await submitComposerLyrics(coordinator, source, "Same words");
    expect(modes).toEqual(["paste"]);
  });
});
