// Shared fixtures for the karaoke Storybook stories. These mirror the shapes
// exercised in karaoke-api.test.ts / karaoke-route-model.test.ts; no fixture
// touches the network, the mic, or timers.
import type { ApiKaraokeLeaderboard, ApiSongKaraokePayload, KaraokeApiClient } from "./karaoke-api";
import { toKaraokeStageLines } from "./lyric-transform";

export const storyPostId = "pst_story1";

export const storyArtworkSrc = "/storybook/karaoke-artwork.svg";

export const storyStageLines = toKaraokeStageLines([
  {
    id: "line-1",
    text: "I don't know why",
    start_ms: 1000,
    end_ms: 4000,
    words: [
      { text: "I", start_ms: 1000, end_ms: 1300 },
      { text: "don't", start_ms: 1300, end_ms: 1900 },
      { text: "know", start_ms: 1900, end_ms: 2500 },
      { text: "why", start_ms: 2500, end_ms: 4000 },
    ],
  },
  {
    id: "line-2",
    text: "you left so early",
    start_ms: 5000,
    end_ms: 8000,
    words: [
      { text: "you", start_ms: 5000, end_ms: 5600 },
      { text: "left", start_ms: 5700, end_ms: 6400 },
      { text: "so", start_ms: 6500, end_ms: 6900 },
      { text: "early", start_ms: 7000, end_ms: 8000 },
    ],
  },
  {
    id: "line-3",
    text: "and I still wait",
    start_ms: 9000,
    end_ms: 12000,
    words: [
      { text: "and", start_ms: 9000, end_ms: 9500 },
      { text: "I", start_ms: 9600, end_ms: 9800 },
      { text: "still", start_ms: 9900, end_ms: 10500 },
      { text: "wait", start_ms: 10600, end_ms: 12000 },
    ],
  },
]);

export const storyPayload: ApiSongKaraokePayload = {
  id: "bundle-story1",
  object: "song_karaoke_payload",
  song: "song_story1",
  post: storyPostId,
  community: "com_story1",
  title: "Apocalypse Dreams",
  artist_name: "Tame Impala",
  artwork_src: storyArtworkSrc,
  karaoke_lines: [
    {
      id: "line-1",
      index: 0,
      kind: "lyric",
      text: "I don't know why",
      start_ms: 1000,
      end_ms: 4000,
      words: [
        { text: "I", start_ms: 1000, end_ms: 1300 },
        { text: "don't", start_ms: 1300, end_ms: 1900 },
        { text: "know", start_ms: 1900, end_ms: 2500 },
        { text: "why", start_ms: 2500, end_ms: 4000 },
      ],
    },
    {
      id: "line-2",
      index: 1,
      kind: "lyric",
      text: "you left so early",
      start_ms: 5000,
      end_ms: 8000,
      words: [
        { text: "you", start_ms: 5000, end_ms: 5600 },
        { text: "left", start_ms: 5700, end_ms: 6400 },
        { text: "so", start_ms: 6500, end_ms: 6900 },
        { text: "early", start_ms: 7000, end_ms: 8000 },
      ],
    },
    {
      id: "line-3",
      index: 2,
      kind: "lyric",
      text: "and I still wait",
      start_ms: 9000,
      end_ms: 12000,
      words: [
        { text: "and", start_ms: 9000, end_ms: 9500 },
        { text: "I", start_ms: 9600, end_ms: 9800 },
        { text: "still", start_ms: 9900, end_ms: 10500 },
        { text: "wait", start_ms: 10600, end_ms: 12000 },
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
  total_ranked: 5,
  entries: [
    leaderboardEntry(1, "maya.eth", 9400),
    leaderboardEntry(2, "loopgarden", 9100),
    leaderboardEntry(3, "the.lostboy", 8800, { is_viewer: true }),
    leaderboardEntry(4, "currentslab.pirate", 7600),
    leaderboardEntry(5, "former_member", 6100, { identity: { visibility: "anonymized", display_name: null, handle: null, avatar_ref: null } }),
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
