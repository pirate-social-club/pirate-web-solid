import type { MediaSubmissionSnapshot } from "./contracts";

export type SongSubmissionView =
  | { readonly status: "editing" }
  | { readonly status: "reconciling"; readonly submissionId?: string }
  | { readonly status: "uploading"; readonly submissionId: string; readonly bytesSent: number; readonly bytesTotal: number }
  | { readonly status: "processing"; readonly submissionId: string; readonly phase: Extract<MediaSubmissionSnapshot, { status: "processing" }>["phase"] }
  | { readonly status: "action_required"; readonly submissionId: string; readonly expiresAt: string; readonly referenceRequestRef: string }
  | { readonly status: "manual_review"; readonly submissionId: string; readonly reasonCode: "review_required" | "moderation_unavailable"; readonly reviewRef: string }
  | { readonly status: "published"; readonly submissionId: string; readonly postHref: string }
  | { readonly status: "blocked"; readonly submissionId: string; readonly reasonCode: "policy_violation" }
  | { readonly status: "processing_failed"; readonly submissionId: string; readonly reasonCode: string; readonly retryable: boolean }
  | { readonly status: "abandoned"; readonly submissionId: string; readonly reasonCode: string };

export interface SongAnalysisProjection {
  readonly lyricsEditor:
    | { readonly status: "ready" }
    | { readonly status: "accepted"; readonly text: string; readonly lyricsRevision: number }
    | { readonly status: "no_lyrics" };
}

export function projectMediaSubmission(snapshot: MediaSubmissionSnapshot): SongSubmissionView {
  switch (snapshot.status) {
    case "processing": return { status: "processing", submissionId: snapshot.submission_id, phase: snapshot.phase };
    case "action_required": return {
      status: "action_required",
      submissionId: snapshot.submission_id,
      expiresAt: snapshot.action.expires_at,
      referenceRequestRef: snapshot.action.reference_request_ref,
    };
    case "manual_review": return {
      status: "manual_review",
      submissionId: snapshot.submission_id,
      reasonCode: snapshot.reason_code,
      reviewRef: snapshot.review_ref,
    };
    case "published": return { status: "published", submissionId: snapshot.submission_id, postHref: snapshot.published_resource.href };
    case "blocked": return { status: "blocked", submissionId: snapshot.submission_id, reasonCode: snapshot.reason_code };
    case "processing_failed": return {
      status: "processing_failed",
      submissionId: snapshot.submission_id,
      reasonCode: snapshot.reason_code,
      retryable: snapshot.retryable,
    };
    case "abandoned": return { status: "abandoned", submissionId: snapshot.submission_id, reasonCode: snapshot.reason_code };
  }
}

export function projectSongAnalysis(snapshot: MediaSubmissionSnapshot): SongAnalysisProjection {
  const current = snapshot.lyrics_state.current;
  if (current.status === "ready") {
    return {
      lyricsEditor: {
        status: "accepted",
        text: current.text,
        lyricsRevision: current.lyrics_revision,
      },
    };
  }
  if (current.status === "no_lyrics") return { lyricsEditor: { status: "no_lyrics" } };
  return { lyricsEditor: { status: "ready" } };
}
