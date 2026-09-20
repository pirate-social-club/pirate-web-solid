import { ApiClientError } from "@pirate/api-client";
import { describe, expect, test, vi } from "vitest";
import {
  reserveSongVideo,
  sameReservationPlan,
  SongReservationMismatch,
  type SongVideoReservation,
  type SongVideoSelection,
  verifySongReservation,
} from "./contracts";
import {
  canonicalTiming,
  createSongIntervalPreflight,
  intervalFromExcerpt,
  isDefinitiveSongRefusal,
  msAtOrAfter,
  msAtOrBefore,
  samplesFromMs,
  type SongIntervalPreflightResponse,
  songPlanFromError,
  songPlanFromPreflight,
  songPlanText,
  songReferenceInvalidText,
  songRefusalCode,
  songReservationRefusalText,
} from "./song-reference";
import { createVideoTransport } from "./transport";

const policy = {
  policy_revision: 1,
  sample_rate_hz: 48_000,
  min_clip_duration_samples: 144_000,
  max_clip_duration_samples: 8_640_000,
} as const;
const ready = (interval: Extract<SongIntervalPreflightResponse, { state: "ready" }>["interval"]) =>
  ({
    state: "ready",
    song_post_id: "song-post",
    audio_revision: 7,
    canonical_duration_samples: 10_080_047,
    interval_policy: policy,
    interval,
  }) as const;

function declared(status: number, code: string, reasonCode: string, retryable = false) {
  return new ApiClientError(
    { status, code, name: "Declared", retryable },
    { error: { code, message: "Refused", retryable, details: { reason_code: reasonCode } } },
  );
}

const selection: SongVideoSelection = {
  songPostId: "song-post",
  audioRevision: 7,
  clipStartSamples: 1_488_000,
  clipDurationSamples: 576_000,
  selectedFrom: { kind: "library" },
};
const upload = {
  method: "MULTIPART",
  upload_id: "upload",
  part_size_bytes: 10,
  part_count: 1,
  expires_at: "2099-01-01T00:00:00Z",
  parts: [{ part_number: 1, url: "https://upload.example/1", expires_at: "2099-01-01T00:00:00Z" }],
} as const;
const songReservation: SongVideoReservation = {
  reservation_id: "reservation",
  track: "video",
  slot: "primary_video",
  status: "awaiting_upload",
  author_persona_id: "persona",
  ingest_policy_revision: 1,
  upload,
  intent: "song_reference",
  song_reference: { song_post_id: "song-post", audio_revision: 7, song_asset_id: "song-asset" },
  reservation_policy_snapshot: {
    observed_at_transition: "media_reservation_issued",
    owner_policy_revision: 3,
    owner_policy_hash: "a".repeat(64),
    derivative_video: "allowed",
    observed_at: "2026-09-11T00:00:00Z",
  },
  interval: { clip_start_samples: 1_488_000, clip_duration_samples: 576_000, song_duration_samples: 10_080_047 },
};
const reserve = () =>
  reserveSongVideo({
    communityId: "community",
    personaId: "persona",
    key: "reserve-key",
    file: { size: 1_024, type: "video/mp4" },
    song: selection,
  });

describe("excerpt bounds become samples exactly", () => {
  test("whole milliseconds convert at 48 samples each, with nothing rounded", () => {
    expect(samplesFromMs(0)).toBe(0);
    expect(samplesFromMs(1)).toBe(48);
    expect(samplesFromMs(30_000)).toBe(1_440_000);
    expect(samplesFromMs(180_000)).toBe(8_640_000);
    expect(intervalFromExcerpt({ startMs: 31_000, endMs: 43_000 })).toEqual({
      clip_start_samples: 1_488_000,
      clip_duration_samples: 576_000,
    });
  });

  test("anything that is not whole, ordered milliseconds is refused rather than rounded", () => {
    for (const value of [1.5, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER]) {
      expect(() => samplesFromMs(value)).toThrow();
    }
    expect(() => intervalFromExcerpt({ startMs: 5_000, endMs: 5_000 })).toThrow();
  });

  test("a canonical length is read down to the last whole millisecond and a minimum up", () => {
    expect(msAtOrBefore(10_080_047)).toBe(210_000);
    expect(msAtOrBefore(10_080_000)).toBe(210_000);
    expect(msAtOrAfter(144_000)).toBe(3_000);
    expect(msAtOrAfter(144_001)).toBe(3_001);
    expect(canonicalTiming(ready(null))).toEqual({
      songPostId: "song-post",
      audioRevision: 7,
      durationMs: 210_000,
      minExcerptMs: 3_000,
      maxExcerptMs: 180_000,
    });
    expect(canonicalTiming({ state: "measuring", song_post_id: "song-post", audio_revision: 7, retry_after_ms: 2_000 })).toBeNull();
  });
});

describe("the server's answer decides the plan", () => {
  const sent = { songPostId: "song-post", bounds: { startMs: 31_000, endMs: 43_000 } };

  test("an accepted interval is ready with the server's revision and the exact samples", () => {
    expect(songPlanFromPreflight(ready({ accepted: true }), sent)).toEqual({ kind: "ready", selection });
  });

  test("each other preflight state keeps the song out of the publication", () => {
    expect(songPlanFromPreflight(ready({ accepted: false, reason: "canonical_song_interval_uncovered" }), sent))
      .toEqual({ kind: "refused", reason: "canonical_song_interval_uncovered" });
    expect(songPlanFromPreflight(ready(null), sent)).toEqual({ kind: "failed", retryable: true });
    expect(songPlanFromPreflight({ state: "measuring", song_post_id: "song-post", audio_revision: 7, retry_after_ms: 1_500 }, sent))
      .toEqual({ kind: "measuring", retryAfterMs: 1_500 });
    expect(songPlanFromPreflight({ state: "unavailable", song_post_id: "song-post", audio_revision: 7, reason: "canonical_timing_unavailable" }, sent))
      .toEqual({ kind: "timing_unavailable" });
  });

  test("declared refusals map to what the author can act on", () => {
    expect(songPlanFromError(declared(400, "bad_request", "capability_unavailable"))).toEqual({ kind: "not_available" });
    expect(songPlanFromError(declared(400, "bad_request", "interval_too_long"))).toEqual({ kind: "refused", reason: "interval_too_long" });
    expect(songPlanFromError(declared(403, "eligibility_failed", "derivative_video_owner_only")))
      .toEqual({ kind: "ineligible", reasonCode: "derivative_video_owner_only" });
    expect(songPlanFromError(declared(409, "conflict", "canonical_timing_pending", true)))
      .toEqual({ kind: "measuring", retryAfterMs: 2_000 });
    expect(songPlanFromError(declared(409, "conflict", "canonical_timing_unavailable"))).toEqual({ kind: "timing_unavailable" });
    expect(songPlanFromError(declared(429, "rate_limited", "rate_limited", true))).toEqual({ kind: "failed", retryable: true });
    expect(songRefusalCode(declared(409, "conflict", "idempotency_conflict"))).toBeUndefined();
    expect(songRefusalCode(declared(403, "eligibility_failed", "age_restricted"))).toBe("age_restricted");
  });

  test("only song facts that a replay cannot change are definitive conflicts", () => {
    expect(isDefinitiveSongRefusal(declared(409, "conflict", "song_audio_revision_changed"))).toBe(true);
    expect(isDefinitiveSongRefusal(declared(409, "conflict", "canonical_timing_unavailable"))).toBe(true);
    expect(isDefinitiveSongRefusal(declared(409, "conflict", "idempotency_conflict"))).toBe(false);
    expect(isDefinitiveSongRefusal(declared(409, "conflict", "canonical_timing_pending", true))).toBe(false);
  });

  test("a retained excerpt blocks publishing until the server accepts it or the author chooses own sound", () => {
    expect(songPlanText({ kind: "none" })).toContain("its own sound");
    for (const state of [
      { kind: "not_available" },
      { kind: "measuring", retryAfterMs: 2_000 },
      { kind: "timing_unavailable" },
      { kind: "refused", reason: "interval_too_short" },
      { kind: "ineligible", reasonCode: "derivative_video_blocked" },
      { kind: "failed", retryable: true },
    ] as const) {
      expect(songPlanText(state)).toContain("Publishing with the song is blocked");
      expect(songPlanText(state)).toContain("Use original sound");
    }
    expect(songPlanText({ kind: "not_available" })).toContain("isn’t available yet");
    const accepted = songPlanText({ kind: "ready", selection });
    expect(accepted).toContain("0:31 to 0:43");
    expect(accepted).toContain("only if it accepts");
    expect(songReservationRefusalText("capability_unavailable")).toContain("isn’t available yet");
    expect(songReservationRefusalText(undefined)).toBeUndefined();
    expect(songReservationRefusalText("song_reference_mismatch")).toContain("nothing was uploaded");
    expect(songReferenceInvalidText("derivative_video_owner_only")).toContain("Only the song’s owner");
    expect(songReferenceInvalidText(null)).toContain("can no longer be used");
  });
});

describe("the preflight goes through the generated client", () => {
  test("it sends the session, the CSRF value and the caller's signal", async () => {
    const operation = vi.fn().mockResolvedValue(ready({ accepted: true }));
    const preflight = createSongIntervalPreflight({
      api: { post_communitiesCommunityIdSongVideoIntervalPreflights: operation },
      csrfToken: () => "csrf",
    });
    const controller = new AbortController();
    const input = {
      path: { communityId: "community" },
      body: { song_post_id: "song-post", interval: { clip_start_samples: 1_488_000, clip_duration_samples: 576_000 } },
    };
    await expect(preflight(input, controller.signal)).resolves.toEqual(ready({ accepted: true }));
    const [sentInput, options] = operation.mock.calls[0] ?? [];
    expect(sentInput).toEqual(input);
    expect(options.credentials).toBe("same-origin");
    expect(options.signal).toBe(controller.signal);
    expect(new Headers(options.headers).get("x-csrf-token")).toBe("csrf");
  });

  test("an answer about a different song is refused, and no request goes out without CSRF", async () => {
    const operation = vi.fn().mockResolvedValue({ ...ready(null), song_post_id: "other-song" });
    const input = { path: { communityId: "community" }, body: { song_post_id: "song-post" } };
    await expect(createSongIntervalPreflight({
      api: { post_communitiesCommunityIdSongVideoIntervalPreflights: operation }, csrfToken: () => "csrf",
    })(input)).rejects.toThrow("different song");
    const unused = vi.fn();
    await expect(createSongIntervalPreflight({
      api: { post_communitiesCommunityIdSongVideoIntervalPreflights: unused }, csrfToken: () => undefined,
    })(input)).rejects.toThrow("CSRF");
    expect(unused).not.toHaveBeenCalled();
  });
});

describe("a song-backed reservation", () => {
  test("sends the song, the server's revision and the interval in samples", () => {
    expect(reserve()).toEqual({
      path: { communityId: "community" },
      body: {
        persona_id: "persona",
        idempotency_key: "reserve-key",
        track: "video",
        slot: "primary_video",
        intent: "song_reference",
        expected_content_type: "video/mp4",
        expected_size_bytes: 1_024,
        song_post_id: "song-post",
        selected_from: { kind: "library" },
        audio_revision: 7,
        clip_start_samples: 1_488_000,
        clip_duration_samples: 576_000,
      },
    });
    expect(() => reserveSongVideo({ ...reserveInput(), song: { ...selection, clipStartSamples: 1.5 } })).toThrow();
    expect(() => reserveSongVideo({ ...reserveInput(), song: { ...selection, audioRevision: 0 } })).toThrow();
  });

  test("is accepted only when the server froze exactly what was sent", () => {
    const { body } = reserve();
    expect(verifySongReservation(body, songReservation)).toBe(songReservation);
    const differ = [
      { ...songReservation, interval: { ...songReservation.interval, clip_start_samples: 1_488_048 } },
      { ...songReservation, interval: { ...songReservation.interval, clip_duration_samples: 575_952 } },
      { ...songReservation, interval: { ...songReservation.interval, song_duration_samples: 2_000_000 } },
      { ...songReservation, song_reference: { ...songReservation.song_reference, audio_revision: 8 } },
      { ...songReservation, song_reference: { ...songReservation.song_reference, song_post_id: "other" } },
    ];
    for (const result of differ) expect(() => verifySongReservation(body, result)).toThrow(SongReservationMismatch);
    const { song_reference: _song, reservation_policy_snapshot: _policy, interval: _interval, ...common } = songReservation;
    expect(() => verifySongReservation(body, { ...common, intent: "original_audio" })).toThrow(SongReservationMismatch);
  });

  test("a renewal must keep the song and the frozen interval", () => {
    expect(sameReservationPlan(songReservation, { ...songReservation, upload: { ...upload, expires_at: "2099-02-01T00:00:00Z" } })).toBe(true);
    expect(sameReservationPlan(songReservation, { ...songReservation, interval: { ...songReservation.interval, clip_start_samples: 0 } })).toBe(false);
  });

  test("the transport rejects an echo that differs and accepts a snapshot posted to a song", async () => {
    const api = {
      post_communitiesCommunityIdMediaUploadReservations: vi.fn().mockResolvedValue({
        ...songReservation, interval: { ...songReservation.interval, clip_duration_samples: 576_048 },
      }),
      get_mediaPostSubmissionsSubmissionId: vi.fn().mockResolvedValue({
        submission_id: "submission", track: "video", intent: "song_reference", status: "blocked",
        reason_code: "song_reference_invalid", song_reason_code: "derivative_video_blocked",
      }),
    };
    // SAFETY: the transport under test calls only these two operations, and
    // both are given; any other call fails the test.
    const transport = createVideoTransport({ api: api as never, csrfToken: () => "csrf" });
    await expect(transport.execute({ kind: "reserve", input: reserve() })).rejects.toThrow(SongReservationMismatch);
    api.post_communitiesCommunityIdMediaUploadReservations.mockResolvedValue(songReservation);
    await expect(transport.execute({ kind: "reserve", input: reserve() })).resolves.toBe(songReservation);
    await expect(transport.read("submission")).resolves.toMatchObject({ intent: "song_reference", reason_code: "song_reference_invalid" });
  });
});

function reserveInput() {
  return { communityId: "community", personaId: "persona", key: "reserve-key", file: { size: 1_024, type: "video/mp4" } };
}
