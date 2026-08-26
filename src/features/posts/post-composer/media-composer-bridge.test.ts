import { describe, expect, test } from "bun:test";

import type { MediaSubmissionSnapshot } from "../media-submission/contracts";
import type { MediaSubmissionCoordinator } from "../media-submission/coordinator";
import { projectSnapshotIntoSongComposer, submitComposerLyrics } from "./media-composer-bridge";

function snapshot(lyricsState: MediaSubmissionSnapshot["lyrics_state"]): MediaSubmissionSnapshot {
  return {
    submission_id: "sub-1",
    author_persona: { persona_id: "persona-1", object: "persona", display_name: null, avatar_ref: null, primary_public_handle: null },
    href: "/media-post-submissions/sub-1",
    track: "song",
    creation_revision: 2,
    audio_revision: 1,
    lyrics_state: lyricsState,
    updated_at: "2026-08-26T00:00:00Z",
    status: "processing",
    phase: "analysis",
  };
}

describe("post composer media bridge", () => {
  test("unlocks an empty lyrics editor without exposing private ASR text", () => {
    expect(projectSnapshotIntoSongComposer(snapshot({
      asr_suggestion: { status: "ready", transcript_revision: 2, text: "ASR lyrics" },
      current: { status: "not_bound" },
    }))).toEqual({ song: { lyricsEditorState: "ready" } });
  });

  test("keeps proven no_speech out of an editable lyrics requirement", () => {
    expect(projectSnapshotIntoSongComposer(snapshot({
      asr_suggestion: { status: "no_speech" },
      current: { status: "no_lyrics" },
    }))).toEqual({ song: { lyricsEditorState: "no_speech" } });
  });

  test("binds first author text as paste even when it matches private ASR evidence", async () => {
    const source = snapshot({
      asr_suggestion: { status: "ready", transcript_revision: 2, text: "Same words" },
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
