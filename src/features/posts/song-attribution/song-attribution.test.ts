import { describe, expect, it, vi } from "vitest";
import {
  createSongAttributionLinkResolver,
  readSongAttribution,
  type SongAttributionClient,
} from "./song-attribution";

const songVideo = {
  track: "video",
  soundtrack: {
    kind: "song_reference",
    song_reference: {
      song_post_id: "song-post-id",
      song_title: "A projected song",
      song_author_persona_id: "persona-id",
    },
    render_mode: "canonical_replace",
  },
};

describe("reading the projected song attribution", () => {
  it("reads the song post, title and author from a song-backed video", () => {
    expect(readSongAttribution(songVideo)).toEqual({
      songPostId: "song-post-id",
      title: "A projected song",
      songAuthorPersonaId: "persona-id",
    });
  });

  it("has nothing to show for a video with its own sound", () => {
    expect(readSongAttribution({
      track: "video",
      soundtrack: { kind: "original_audio", original_sound_id: "s", origin_video_post_id: "p", origin_author_persona_id: "a" },
    })).toBeNull();
  });

  it("fails closed on malformed or incomplete projections", () => {
    expect(readSongAttribution(null)).toBeNull();
    expect(readSongAttribution({ track: "song" })).toBeNull();
    expect(readSongAttribution({ track: "video", soundtrack: { kind: "song_reference" } })).toBeNull();
    expect(readSongAttribution({
      track: "video",
      soundtrack: { kind: "song_reference", song_reference: { song_post_id: "s", song_title: "t" } },
    })).toBeNull();
    expect(readSongAttribution({
      track: "video",
      soundtrack: { kind: "song_reference", song_reference: { song_post_id: "s", song_title: " ", song_author_persona_id: "a" } },
    })).toBeNull();
  });
});

describe("resolving the chip's link", () => {
  const attribution = { songPostId: "song-post-id", title: "A song", songAuthorPersonaId: "persona-id" };

  function client(response: Awaited<ReturnType<SongAttributionClient["get_publicPostsByIdPostIdCanonicalRoute"]>>): SongAttributionClient {
    return { get_publicPostsByIdPostIdCanonicalRoute: async () => response };
  }

  it("uses the song's canonical path and names the author", async () => {
    const resolve = createSongAttributionLinkResolver({
      client: client({
        kind: "content",
        post_id: "song-post-id",
        content: { post: { song_title: "The song", author_persona: { display_name: "The author", primary_public_handle: "handle" } } },
        route: { canonical_path: "/posts/a-song" },
      }),
    });
    expect(await resolve(attribution)).toEqual({ href: "/posts/a-song", title: "The song", authorName: "The author" });
  });

  it("falls back to the public handle and then to no name", async () => {
    const resolve = createSongAttributionLinkResolver({
      client: client({
        kind: "content",
        post_id: "song-post-id",
        content: { post: { author_persona: { primary_public_handle: "handle" } } },
        route: { canonical_path: "/posts/a-song" },
      }),
    });
    expect(await resolve(attribution)).toEqual({ href: "/posts/a-song", title: null, authorName: "handle" });
  });

  it("has no link when the song has no canonical route", async () => {
    const resolve = createSongAttributionLinkResolver({
      client: client({ kind: "content", post_id: "song-post-id", content: { post: {} }, route: null }),
    });
    expect(await resolve(attribution)).toBeNull();
  });

  it("fails closed and caches the answer per song", async () => {
    const read = vi.fn(async () => { throw new Error("unavailable"); });
    const resolve = createSongAttributionLinkResolver({
      client: { get_publicPostsByIdPostIdCanonicalRoute: read },
    });
    expect(await resolve(attribution)).toBeNull();
    expect(await resolve(attribution)).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
  });
});
