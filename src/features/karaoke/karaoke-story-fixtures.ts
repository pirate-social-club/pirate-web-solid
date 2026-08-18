// Shared fixtures for the karaoke Storybook stories. These mirror the shapes
// exercised in karaoke-api.test.ts / karaoke-route-model.test.ts; no fixture
// touches the network, the mic, or timers.
import type { ApiKaraokeLeaderboard, ApiSongKaraokePayload, KaraokeApiClient } from "./karaoke-api";
import { toKaraokeStageLines } from "./lyric-transform";

export const storyPostId = "pst_story1";

export const storyStageLines = toKaraokeStageLines([
  {
    id: "line-1",
    text: "Sail away with me tonight",
    start_ms: 1000,
    end_ms: 4000,
    words: [
      { text: "Sail", start_ms: 1000, end_ms: 1600 },
      { text: "away", start_ms: 1700, end_ms: 2300 },
      { text: "with", start_ms: 2400, end_ms: 2800 },
      { text: "me", start_ms: 2900, end_ms: 3300 },
      { text: "tonight", start_ms: 3400, end_ms: 4000 },
    ],
  },
  {
    id: "line-2",
    text: "Under a paper moon",
    start_ms: 5000,
    end_ms: 8000,
    words: [
      { text: "Under", start_ms: 5000, end_ms: 5600 },
      { text: "a", start_ms: 5700, end_ms: 5900 },
      { text: "paper", start_ms: 6000, end_ms: 6800 },
      { text: "moon", start_ms: 6900, end_ms: 8000 },
    ],
  },
]);

export const storyPayload: ApiSongKaraokePayload = {
  id: "bundle-story1",
  object: "song_karaoke_payload",
  song: "song_story1",
  post: storyPostId,
  community: "com_story1",
  title: "Paper Moon",
  artist_name: "The Harborlights",
  karaoke_lines: [
    {
      id: "line-1",
      index: 0,
      kind: "lyric",
      text: "Sail away with me tonight",
      start_ms: 1000,
      end_ms: 4000,
      words: [
        { text: "Sail", start_ms: 1000, end_ms: 1600 },
        { text: "away", start_ms: 1700, end_ms: 2300 },
        { text: "with", start_ms: 2400, end_ms: 2800 },
        { text: "me", start_ms: 2900, end_ms: 3300 },
        { text: "tonight", start_ms: 3400, end_ms: 4000 },
      ],
    },
    {
      id: "line-2",
      index: 1,
      kind: "lyric",
      text: "Under a paper moon",
      start_ms: 5000,
      end_ms: 8000,
      words: [
        { text: "Under", start_ms: 5000, end_ms: 5600 },
        { text: "a", start_ms: 5700, end_ms: 5900 },
        { text: "paper", start_ms: 6000, end_ms: 6800 },
        { text: "moon", start_ms: 6900, end_ms: 8000 },
      ],
    },
  ],
};

function leaderboardEntry(
  rank: number,
  handle: string,
  score: number,
  overrides: Partial<ApiKaraokeLeaderboard["entries"][number]> = {},
): ApiKaraokeLeaderboard["entries"][number] {
  return {
    rank,
    top_percent: rank * 5,
    score,
    reached_at: "2026-08-01T12:00:00Z",
    identity: {
      visibility: "visible",
      display_name: handle,
      handle,
      avatar_ref: null,
    },
    is_viewer: false,
    ...overrides,
  };
}

export const storyLeaderboard: ApiKaraokeLeaderboard = {
  object: "karaoke_song_leaderboard",
  post_id: storyPostId,
  community_id: "com_story1",
  scope: "all_time",
  karaoke_revision_id: "rev-story1",
  scoring_version: 1,
  scoring_provider: "openai",
  scoring_model: "story-model",
  total_ranked: 3,
  entries: [
    leaderboardEntry(1, "captain_aria", 9800),
    leaderboardEntry(2, "lowtide", 8720),
    leaderboardEntry(3, "you_sing", 7410, { is_viewer: true }),
  ],
  viewer_rank: 3,
  viewer_top_percent: 15,
  viewer_best_score: 7410,
  viewer_best_reached_at: "2026-08-01T12:00:00Z",
  viewer_eligible_attempt_count: 2,
};

export const storyEmptyLeaderboard: ApiKaraokeLeaderboard = {
  ...storyLeaderboard,
  total_ranked: 0,
  entries: [],
  viewer_rank: null,
  viewer_top_percent: null,
  viewer_best_score: null,
  viewer_best_reached_at: null,
  viewer_eligible_attempt_count: 0,
};

// Stubbed KaraokeApiClient seam, mirroring the client() helper in
// karaoke-route-model.test.ts. Default methods reject so a story fails loudly
// if the component reaches an endpoint the story did not stub.
export function storyKaraokeClient(overrides: Partial<KaraokeApiClient> = {}): KaraokeApiClient {
  return {
    createSession: async () => {
      throw new Error("story stub: createSession was not expected");
    },
    getAttempt: async () => {
      throw new Error("story stub: getAttempt was not expected");
    },
    getLeaderboard: async () => {
      throw new Error("story stub: getLeaderboard was not expected");
    },
    getPayload: async () => storyPayload,
    ...overrides,
  };
}
