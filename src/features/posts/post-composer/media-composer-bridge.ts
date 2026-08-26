import type { MediaSubmissionSnapshot, SongRoyaltyAllocation } from "../media-submission/contracts";
import type { MediaSubmissionCoordinator } from "../media-submission/coordinator";
import { projectSongAnalysis } from "../media-submission/projection";
import type { AssetLicenseState, AssetRoyaltySplitState, SongComposerState, SongMode } from "./types";

export interface SongComposerBridgeInput {
  readonly coordinator: MediaSubmissionCoordinator;
  readonly draftId: string;
  readonly principalId: string;
  readonly communityId: string;
  readonly personaId: string;
  readonly song: SongComposerState;
  readonly songMode: SongMode;
  readonly license: AssetLicenseState;
  readonly royaltySplit: AssetRoyaltySplitState;
}

function bridgeAllocations(split: AssetRoyaltySplitState): readonly SongRoyaltyAllocation[] {
  return split.allocations.map(allocation => {
    if (allocation.recipientId === undefined || allocation.shareBps === undefined) {
      throw new Error("Every song collaborator needs a recipient id and integer basis-point share");
    }
    return { recipientId: allocation.recipientId, shareBps: allocation.shareBps };
  });
}

/**
 * Starts the generated-client media flow from exactly one audio file. Terms
 * bind immediately after creation so ACR/ASR may run concurrently with the
 * non-text license command; upload completion still never implies publish.
 */
export async function submitSongComposer(input: SongComposerBridgeInput): Promise<MediaSubmissionSnapshot> {
  const audio = input.song.primaryAudioUpload;
  const title = input.song.title?.trim() ?? "";
  if (!audio || title === "") throw new Error("A song audio file and title are required");
  if (input.coordinator.currentRecord === null) {
    await input.coordinator.begin({
      draftId: input.draftId,
      principalId: input.principalId,
      communityId: input.communityId,
      personaId: input.personaId,
      audio,
      title,
      songType: input.songMode,
    });
  } else if (input.coordinator.currentRecord.draft_id !== input.draftId) {
    throw new Error("Resolve the retained media submission for the other draft first");
  }
  await input.coordinator.ensureStarted();
  const allocations = bridgeAllocations(input.royaltySplit);
  const termsAlreadyIssued = input.coordinator.currentRecord?.commands.some(command => command.kind === "terms") ?? false;
  if (!termsAlreadyIssued && input.license.presetId === "commercial-remix") {
    await input.coordinator.bindTerms({
      licensePreset: input.license.presetId,
      commercialRevShareBps: input.license.commercialRevShareBps ?? 1_000,
      allocations,
    });
  } else if (!termsAlreadyIssued) {
    await input.coordinator.bindTerms({ licensePreset: input.license.presetId, allocations });
  }
  return input.coordinator.uploadAndFinalize();
}

export interface SongComposerSnapshotProjection {
  readonly lyricsValue?: string;
  readonly song: Pick<SongComposerState, "lyricsEditorState">;
}

export function projectSnapshotIntoSongComposer(snapshot: MediaSubmissionSnapshot): SongComposerSnapshotProjection {
  const projection = projectSongAnalysis(snapshot).lyricsEditor;
  switch (projection.status) {
    // ASR is private safety evidence. Readiness unlocks an empty author-owned
    // editor but never projects transcript text into the composer.
    case "asr_ready": return { song: { lyricsEditorState: "ready" } };
    case "accepted": return { lyricsValue: projection.text, song: { lyricsEditorState: "ready" } };
    case "no_speech": return { song: { lyricsEditorState: "no_speech" } };
    case "unavailable": return { song: { lyricsEditorState: "unavailable" } };
    case "waiting": return { song: { lyricsEditorState: "waiting" } };
  }
}

export async function submitComposerLyrics(
  coordinator: Pick<MediaSubmissionCoordinator, "bindLyrics">,
  snapshot: MediaSubmissionSnapshot,
  lyrics: string,
): Promise<MediaSubmissionSnapshot> {
  const current = snapshot.lyrics_state.current;
  if (current.status === "ready" && current.text !== lyrics) return coordinator.bindLyrics(lyrics, "correct");
  // First publication is always explicit author text, even if it happens to
  // match the private transcript evidence byte-for-byte.
  if (current.status === "not_bound") return coordinator.bindLyrics(lyrics, "paste");
  return snapshot;
}
