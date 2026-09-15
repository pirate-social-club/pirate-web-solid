import { normalizeRoyaltyAllocations, type MediaSubmissionSnapshot, type SongRoyaltyAllocation } from "../media-submission/contracts";
import type { MediaSubmissionCoordinator } from "../media-submission/coordinator";
import { projectSongAnalysis } from "../media-submission/projection";
import type { AssetLicenseState, AssetRoyaltySplitState, SongComposerState, SongMode } from "./types";

export interface SongComposerBridgeInput {
  readonly coordinator: MediaSubmissionCoordinator;
  readonly communityId: string;
  readonly personaId: string;
  readonly song: SongComposerState;
  readonly songMode: SongMode;
  readonly license: AssetLicenseState;
  readonly royaltySplit: AssetRoyaltySplitState;
  readonly lyrics?: string;
  readonly authorDeclaredRating: "general" | "adult_18";
  readonly signal?: AbortSignal;
}

function bridgeAllocations(split: AssetRoyaltySplitState): readonly SongRoyaltyAllocation[] {
  return split.allocations.map(allocation => {
    if (allocation.recipientId === undefined || allocation.shareBps === undefined) {
      throw new Error("Every song collaborator needs a recipient id and integer basis-point share");
    }
    return { recipientId: allocation.recipientId, shareBps: allocation.shareBps };
  });
}

/** Seal audio without terms: the existing server terms fence holds publication. */
export async function prepareSongComposer(input: SongComposerBridgeInput): Promise<MediaSubmissionSnapshot> {
  const audio = input.song.primaryAudioUpload;
  const title = input.song.title?.trim() ?? "";
  if (!audio || title === "") throw new Error("A song audio file and title are required");
  if (input.coordinator.currentRecord === null) {
    await input.coordinator.begin({
      communityId: input.communityId,
      personaId: input.personaId,
      audio,
      title,
      songType: input.songMode,
      authorDeclaredRating: input.authorDeclaredRating,
    });
  }
  await input.coordinator.ensureStarted();
  return input.coordinator.uploadAndFinalize(undefined, input.signal);
}

export function validateSongComposerTerms(split: AssetRoyaltySplitState, personaId: string): void {
  normalizeRoyaltyAllocations(bridgeAllocations(split), personaId);
}

/** Lyrics are accepted before terms can release the song for publication. */
export async function submitSongComposer(input: SongComposerBridgeInput): Promise<MediaSubmissionSnapshot> {
  validateSongComposerTerms(input.royaltySplit, input.personaId);
  let snapshot = await prepareSongComposer(input);
  if (snapshot.status === "published" || snapshot.status === "blocked" || snapshot.status === "abandoned") return snapshot;
  if (snapshot.audio_revision < 1) throw new Error("Wait for the audio upload to finish before publishing");
  const lyrics = input.lyrics ?? "";
  const accepted = snapshot.lyrics_state.current;
  if (lyrics.trim() !== "") {
    snapshot = await submitComposerLyrics(input.coordinator, snapshot, lyrics);
    const current = snapshot.lyrics_state.current;
    if (current.status !== "ready" || current.text !== lyrics) {
      throw new Error("Your reviewed lyrics have not been accepted. Check the submission before publishing");
    }
  } else if (accepted.status === "ready") {
    throw new Error("This song already has accepted lyrics. Restore them before publishing");
  }
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
  return (await input.coordinator.refresh()) ?? snapshot;
}

export interface SongComposerSnapshotProjection {
  readonly lyricsValue?: string;
  readonly song: Pick<SongComposerState, "lyricsEditorState">;
}

export function projectSnapshotIntoSongComposer(snapshot: MediaSubmissionSnapshot): SongComposerSnapshotProjection {
  if (snapshot.audio_revision < 1) return { song: { lyricsEditorState: "hidden" } };
  const projection = projectSongAnalysis(snapshot).lyricsEditor;
  switch (projection.status) {
    case "ready": return { song: { lyricsEditorState: "ready" } };
    case "accepted": return { lyricsValue: projection.text, song: { lyricsEditorState: "ready" } };
    case "no_lyrics": return { song: { lyricsEditorState: "no_lyrics" } };
  }
}

export async function submitComposerLyrics(
  coordinator: Pick<MediaSubmissionCoordinator, "bindLyrics">,
  snapshot: MediaSubmissionSnapshot,
  lyrics: string,
): Promise<MediaSubmissionSnapshot> {
  const current = snapshot.lyrics_state.current;
  if (current.status === "ready" && current.text !== lyrics) return coordinator.bindLyrics(lyrics, "correct");
  // The first lyrics revision is always explicit author text.
  if (current.status === "not_bound") return coordinator.bindLyrics(lyrics, "paste");
  return snapshot;
}
