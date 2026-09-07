import { normalizeRoyaltyAllocations, type MediaSubmissionSnapshot, type SongRoyaltyAllocation } from "../media-submission/contracts";
import type { MediaSubmissionCoordinator } from "../media-submission/coordinator";
import { mediaCommandBody, type PendingMediaSubmissionV1 } from "../media-submission/pending";
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
  readonly lyrics?: string;
  readonly authorDeclaredRating: "general" | "adult_18";
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
      draftId: input.draftId,
      principalId: input.principalId,
      communityId: input.communityId,
      personaId: input.personaId,
      audio,
      title,
      songType: input.songMode,
      authorDeclaredRating: input.authorDeclaredRating,
    });
  } else if (input.coordinator.currentRecord.draft_id !== input.draftId) {
    throw new Error("Resolve the retained media submission for the other draft first");
  }
  const retained = input.coordinator.currentRecord;
  if (retained === null || retained.principal_id !== input.principalId
    || retained.persona_id !== input.personaId || retained.community_id !== input.communityId) {
    throw new Error("Resolve the retained song in its original community and persona first");
  }
  await input.coordinator.ensureStarted();
  return input.coordinator.uploadAndFinalize();
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

/** Restore the exact retained terms, never substitute the dialog defaults. */
export async function restoreSongComposerTerms(record: PendingMediaSubmissionV1): Promise<{
  license: AssetLicenseState; royaltySplit: AssetRoyaltySplitState;
} | null> {
  const command = record.commands.find(command => command.kind === "terms");
  if (!command) return null;
  const body: unknown = JSON.parse(new TextDecoder().decode(await mediaCommandBody(command)));
  if (typeof body !== "object" || body === null || !("license_preset" in body)
    || !("royalty_allocations" in body) || !Array.isArray(body.royalty_allocations)
    || !["non-commercial", "commercial-use", "commercial-remix"].includes(String(body.license_preset))) {
    throw new Error("The retained song terms could not be restored safely");
  }
  const allocations = body.royalty_allocations.map((value: unknown, index: number) => {
    if (typeof value !== "object" || value === null || !("recipient_id" in value)
      || typeof value.recipient_id !== "string" || !("share_bps" in value) || typeof value.share_bps !== "number") {
      throw new Error("The retained song recipients could not be restored safely");
    }
    return { id: `retained-recipient-${index}`, recipientKind: value.recipient_id === record.persona_id ? "creator" as const : "collaborator" as const,
      recipientId: value.recipient_id, shareBps: value.share_bps, sharePct: value.share_bps / 100 };
  });
  const royaltySplit = { allocations };
  validateSongComposerTerms(royaltySplit, record.persona_id);
  // SAFETY: preset membership was validated above; recipient shares were normalized.
  const presetId = body.license_preset as AssetLicenseState["presetId"];
  const bps = "commercial_rev_share_bps" in body ? body.commercial_rev_share_bps : undefined;
  if (presetId === "commercial-remix" && (typeof bps !== "number" || !Number.isInteger(bps) || bps < 0 || bps > 10_000)) {
    throw new Error("The retained remix share could not be restored safely");
  }
  return { license: { presetId, ...(typeof bps === "number" ? { commercialRevShareBps: bps } : {}) }, royaltySplit };
}
