import { describe, expect, test } from "bun:test";

import type { MediaSubmissionSnapshot } from "./contracts";
import { projectMediaSubmission, projectSongAnalysis } from "./projection";

function snapshot(patch: Partial<MediaSubmissionSnapshot>): MediaSubmissionSnapshot {
  const value = {
    submission_id: "sub-1",
    author_persona: { persona_id: "persona-author", object: "persona", display_name: null, avatar_ref: null, primary_public_handle: "author" },
    href: "/media-post-submissions/sub-1",
    track: "song",
    creation_revision: 2,
    audio_revision: 1,
    lyrics_state: { asr_suggestion: { status: "pending" }, current: { status: "not_bound" } },
    updated_at: "2026-08-26T00:00:00Z",
    status: "processing",
    phase: "analysis",
    ...patch,
  };
  // SAFETY: the base fixture supplies all required fields and patches use only
  // contract-owned snapshot fields to model reachable server projections.
  return value as MediaSubmissionSnapshot;
}

describe("song media projections", () => {
  test("projects upload-finalize, manual review, and publication without inferring from upload", () => {
    expect(projectMediaSubmission(snapshot({ phase: "awaiting_upload" }))).toMatchObject({ status: "processing", phase: "awaiting_upload" });
    expect(projectMediaSubmission(snapshot({ status: "manual_review", reason_code: "review_required", review_ref: "review-1" }))).toEqual({
      status: "manual_review",
      submissionId: "sub-1",
      reasonCode: "review_required",
      reviewRef: "review-1",
    });
    expect(projectMediaSubmission(snapshot({ status: "published", published_resource: { post_id: "post-1", href: "/posts/post-1" } }))).toMatchObject({ status: "published", postHref: "/posts/post-1" });
  });

  test("projects ASR prefill, accepted corrected lyrics, and no_speech distinctly", () => {
    expect(projectSongAnalysis(snapshot({
      lyrics_state: { asr_suggestion: { status: "ready", transcript_revision: 4, text: "ASR words" }, current: { status: "not_bound" } },
    }))).toEqual({ lyricsEditor: { status: "asr_ready", text: "ASR words", transcriptRevision: 4 } });
    expect(projectSongAnalysis(snapshot({
      lyrics_state: { asr_suggestion: { status: "ready", transcript_revision: 4, text: "ASR words" }, current: { status: "ready", text: "Correct words", lyrics_revision: 3, audio_revision: 1, base_transcript_revision: 4 } },
    }))).toEqual({ lyricsEditor: { status: "accepted", text: "Correct words", lyricsRevision: 3, baseTranscriptRevision: 4 } });
    expect(projectSongAnalysis(snapshot({
      lyrics_state: { asr_suggestion: { status: "no_speech" }, current: { status: "no_lyrics" } },
    }))).toEqual({ lyricsEditor: { status: "no_speech" } });
  });
});
