import type { PostCommunitiesCommunityIdMediaUploadReservationsResponse } from "@pirate/api-client";
import type { MediaSubmissionSnapshot } from "../../posts/media-submission/contracts";
import type { MediaSubmissionTransport } from "../../posts/media-submission/transport";

/** A held upload for community-page stories. All commands stay in memory. */
export function createHeldSongUploadTransport(options: { readonly unknownSize?: boolean } = {}) {
  const reservation: PostCommunitiesCommunityIdMediaUploadReservationsResponse = {
    reservation_id: "upload-progress-reservation", track: "song", slot: "primary_audio", status: "awaiting_upload",
    upload: { method: "PUT", url: "https://upload.example.test/song", required_headers: [], expires_at: "2099-01-01T00:00:00Z" },
  };
  const snapshot = (audioRevision: number, phase: "awaiting_upload" | "analysis"): MediaSubmissionSnapshot => ({
    submission_id: "upload-progress-song",
    author_persona: { persona_id: "storybook-persona", object: "persona", display_name: "Harbor", avatar_ref: null, primary_public_handle: null },
    href: "/media-post-submissions/upload-progress-song", track: "song", creation_revision: 1,
    audio_revision: audioRevision, lyrics_state: { current: { status: "not_bound" } },
    updated_at: "2026-10-07T00:00:00Z", status: "processing", phase,
  });
  const commands: string[] = [];
  let uploadCount = 0;
  let current = snapshot(0, "awaiting_upload");
  let progress: (percent: number) => void = () => { throw new Error("Upload has not started"); };
  let finish: () => void = () => { throw new Error("Upload has not started"); };
  const transport: MediaSubmissionTransport = {
    listActive: async () => ({ object: "active_song_media_post_submission_page", items: [], next_cursor: null }),
    read: async () => current,
    dispatch: async command => {
      commands.push(command.kind);
      if (command.kind === "cancel") {
        current = { ...current, status: "abandoned", reason_code: "author_cancelled_before_finalize" };
        return current;
      }
      if (command.kind === "reserve") return reservation;
      if (command.kind === "finalize") current = snapshot(1, "analysis");
      if (command.kind !== "start" && command.kind !== "finalize") {
        throw new Error("The upload story ends at Royalties");
      }
      return current;
    },
    upload: async (_reservation, audio, onProgress, signal) => {
      if (signal?.aborted) throw new DOMException("Upload stopped", "AbortError");
      uploadCount += 1;
      progress = percent => onProgress?.(Math.round(audio.size * percent / 100), options.unknownSize ? 0 : audio.size);
      progress(0);
      await new Promise<void>((resolve, reject) => {
        const abort = () => { signal?.removeEventListener("abort", abort); reject(new DOMException("Upload stopped", "AbortError")); };
        signal?.addEventListener("abort", abort, { once: true });
        finish = () => { signal?.removeEventListener("abort", abort); progress(100); resolve(); };
      });
    },
  };
  return { transport, commands, uploadCount: () => uploadCount, progress: (percent: number) => progress(percent), finish: () => finish() };
}
