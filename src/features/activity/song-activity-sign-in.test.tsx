import { afterEach, expect, test, vi } from "vitest";
import { readSongActivityPreview } from "./song-activity-sign-in.tsx";

const readPost = vi.fn();
const client = { get_postsPostId: readPost };
afterEach(() => readPost.mockReset());

test("projects a preview from the public song read without creating an activity session", async () => {
  readPost.mockResolvedValue({ post: { title: "Post title", song_title: "Song title", lyrics: "\nOpening lyric\nNext lyric" } });
  const signal = new AbortController().signal;
  expect(await readSongActivityPreview("song-1", signal, client)).toEqual({ title: "Song title", firstLine: "Opening lyric" });
  expect(readPost).toHaveBeenCalledExactlyOnceWith({ path: { postId: "song-1" } }, { signal });
});

test("does not invent a lyric when the public song has none", async () => {
  readPost.mockResolvedValue({ post: { title: "Song title", lyrics: null } });
  expect(await readSongActivityPreview("song-1", new AbortController().signal, client)).toEqual({ title: "Song title", firstLine: undefined });
});

test("does not project content from an age-locked response", async () => {
  readPost.mockResolvedValue({ kind: "age_locked" });
  expect(await readSongActivityPreview("song-1", new AbortController().signal, client)).toBeUndefined();
});
