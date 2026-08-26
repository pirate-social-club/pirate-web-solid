import { describe, expect, test } from "bun:test";

import {
  basisPointsToPercentText,
  buildSongLyricsInput,
  buildSongTermsInput,
  buildStartSongInput,
  normalizeRoyaltyAllocations,
  percentTextToBasisPoints,
} from "./contracts";

describe("song media command contracts", () => {
  test("serializes commercial remix percentages as exact integer basis points", () => {
    expect(percentTextToBasisPoints("10")).toBe(1_000);
    expect(percentTextToBasisPoints("10.25")).toBe(1_025);
    expect(percentTextToBasisPoints("0.01")).toBe(1);
    expect(basisPointsToPercentText(1_025)).toBe("10.25");
    expect(() => percentTextToBasisPoints("10.001")).toThrow();
  });

  test("defaults commercial remix to 1000 bps and omits the field for other presets", () => {
    const shared = {
      submissionId: "sub-1",
      personaId: "persona-author",
      idempotencyKey: "terms-1",
      expectedCreationRevision: 1,
      allocations: [{ recipientId: "persona-author", shareBps: 10_000 }],
    };
    expect(buildSongTermsInput({ ...shared, licensePreset: "commercial-remix" }).body).toMatchObject({ commercial_rev_share_bps: 1_000 });
    const nonCommercial = buildSongTermsInput({ ...shared, licensePreset: "non-commercial" }).body;
    expect("commercial_rev_share_bps" in nonCommercial).toBe(false);
    expect("commercial_rev_share_pct" in nonCommercial).toBe(false);
  });

  test("requires unique recipient ids, positive integer shares, author inclusion, and exactly 10000 bps", () => {
    expect(normalizeRoyaltyAllocations([
      { recipientId: "persona-author", shareBps: 7_500 },
      { recipientId: "persona-collaborator", shareBps: 2_500 },
    ], "persona-author")).toEqual([
      { recipient_id: "persona-author", share_bps: 7_500 },
      { recipient_id: "persona-collaborator", share_bps: 2_500 },
    ]);
    expect(() => normalizeRoyaltyAllocations([{ recipientId: "persona-other", shareBps: 10_000 }], "persona-author")).toThrow();
    expect(() => normalizeRoyaltyAllocations([
      { recipientId: "persona-author", shareBps: 5_000 },
      { recipientId: "persona-author", shareBps: 5_000 },
    ], "persona-author")).toThrow();
  });

  test("keeps start form-light and lyrics revisioned after finalization", () => {
    const start = buildStartSongInput({
      communityId: "community-1",
      personaId: "persona-author",
      idempotencyKey: "start-1",
      reservationId: "reservation-1",
      songType: "original",
      title: "Midnight Signal",
    });
    expect(Object.keys(start.body).sort()).toEqual([
      "audio_reservation_id",
      "idempotency_key",
      "persona_id",
      "song_type",
      "title",
      "version",
    ]);
    expect(Object.keys(start.body)).not.toEqual(expect.arrayContaining(["lyrics", "language", "explicitness", "commentary", "body", "artwork"]));

    const lyrics = buildSongLyricsInput({
      submissionId: "sub-1",
      personaId: "persona-author",
      idempotencyKey: "lyrics-1",
      expectedCreationRevision: 3,
      expectedAudioRevision: 1,
      lyrics: "We sail at dawn",
      baseTranscriptRevision: 2,
    });
    expect(lyrics.body).toMatchObject({ version: "bind-song-lyrics-v1", base_transcript_revision: 2 });
  });
});
