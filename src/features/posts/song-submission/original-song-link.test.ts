import { beforeEach, describe, expect, it, vi } from "vitest";
import { originalSongPostId } from "./original-song-link";

const api = { get_publicPostsBySlug: vi.fn(), get_publicPostsByIdPostIdCanonicalRoute: vi.fn() };
const song = { kind: "content", post_id: "post_original", content: { post: { post_type: "song", status: "published" } } };
beforeEach(() => { vi.resetAllMocks(); api.get_publicPostsBySlug.mockResolvedValue(song); api.get_publicPostsByIdPostIdCanonicalRoute.mockResolvedValue(song); });
describe("original song link", () => {
  it("resolves a same-site published song and carries cancellation through the read", async () => {
    const signal = new AbortController().signal;
    expect(await originalSongPostId("/posts/midnight-waves", signal, api)).toBe("post_original");
    expect(api.get_publicPostsBySlug).toHaveBeenCalledWith({ query: { slug: "midnight-waves" } }, { credentials: "same-origin", signal });
    expect(await originalSongPostId("/posts/post_original", undefined, api)).toBe("post_original");
    expect(api.get_publicPostsByIdPostIdCanonicalRoute).toHaveBeenCalledWith({ path: { postId: "post_original" } }, { credentials: "same-origin" });
  });
  it.each(["https://elsewhere.test/posts/source", "/community/abc", "/posts/source?next=elsewhere", "/posts/source#unrelated"])("rejects an unrelated link without requesting it: %s", async link => {
    await expect(originalSongPostId(link, undefined, api)).rejects.toThrow();
    expect(api.get_publicPostsBySlug).not.toHaveBeenCalled();
    expect(api.get_publicPostsByIdPostIdCanonicalRoute).not.toHaveBeenCalled();
  });
  it.each([{ kind: "age_locked" }, { kind: "content", post_id: "post_text", content: { post: { post_type: "text", status: "published" } } }, { kind: "content", post_id: "post_unpublished", content: { post: { post_type: "song", status: "processing" } } }])("rejects unavailable or non-song posts", async result => {
    api.get_publicPostsBySlug.mockResolvedValue(result);
    await expect(originalSongPostId("/posts/source", undefined, api)).rejects.toThrow("isn't available");
  });
});
