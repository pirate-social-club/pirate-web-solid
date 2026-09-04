import { describe, expect, it, vi } from "vitest";
import type { GetPublicPostsBySlugResponse } from "@pirate/api-client";
import {
  decodePublicPostSlug,
  loadPublicPostBySlug,
  loadPublicPostById,
  projectPublicPostResponse,
  publicPostPathFromRequest,
} from "./public-post-route.model.ts";

function contentResponse(route: null | {
  canonical_path: string;
  activity_paths: { study: string; karaoke: string; karaoke_leaderboard: string };
}): GetPublicPostsBySlugResponse {
  const fixture = {
    kind: "content",
    post_id: "post-1",
    content: { post: { id: "post-1" } },
    route,
  };
  // SAFETY: projection tests intentionally use the minimal subset read by the
  // projector; generated-client validation is exercised at the transport boundary.
  return JSON.parse(JSON.stringify(fixture)) as GetPublicPostsBySlugResponse;
}

describe("public post raw slug boundary", () => {
  it.each([
    "%",
    "%2",
    "%GG",
    "%C3%28",
    "%252F",
    "%2F",
    "%5c",
    ".",
    "..",
    "%EF%BC%8F",
  ])("rejects invalid or multiply encoded segment %s before lookup", raw => {
    expect(decodePublicPostSlug(raw)).toBeNull();
  });

  it("decodes exactly once and applies NFKC without slugifying", () => {
    expect(decodePublicPostSlug("stra%C3%9Fe")).toEqual({ raw: "stra%C3%9Fe", logical: "straße" });
    expect(decodePublicPostSlug("%EF%BC%A1thina")).toEqual({ raw: "%EF%BC%A1thina", logical: "Athina" });
    expect(decodePublicPostSlug("你好-world")).toEqual({ raw: "你好-world", logical: "你好-world" });
  });

  it("extracts only the four canonical route leaves", () => {
    expect(publicPostPathFromRequest(new Request("https://pirate.sc/posts/song/karaoke/leaderboard")))
      .toEqual({ rawSlug: "song", activity: "karaoke-leaderboard" });
    expect(publicPostPathFromRequest(new Request("https://pirate.sc/posts/song/")))
      .toEqual({ rawSlug: "song", activity: "detail" });
    expect(publicPostPathFromRequest(new Request("https://pirate.sc/posts/song/extra"))).toBeUndefined();
  });

  it("redirects a valid noncanonical wire spelling to the API-owned activity path", () => {
    const route = {
      canonical_path: "/posts/stra%C3%9Fe",
      activity_paths: {
        study: "/posts/stra%C3%9Fe/study",
        karaoke: "/posts/stra%C3%9Fe/karaoke",
        karaoke_leaderboard: "/posts/stra%C3%9Fe/karaoke/leaderboard",
      },
    };
    expect(projectPublicPostResponse({
      activity: "study",
      logicalSlug: "straße",
      requestPath: "/posts/stra%c3%9fe/study",
      response: contentResponse(route),
    })).toEqual({
      kind: "redirect",
      status: 308,
      location: "https://pirate.sc/posts/stra%C3%9Fe/study",
    });
  });

  it("never redirects or exposes a canonical URL for a guarded content response", () => {
    const state = projectPublicPostResponse({
      activity: "detail",
      logicalSlug: "private-title",
      requestPath: "/posts/%70rivate-title",
      response: contentResponse(null),
    });
    expect(state).toMatchObject({ kind: "content", status: 200, canonicalPath: null, canonicalUrl: null });
  });

  it("never canonicalizes an age-lock placeholder", () => {
    expect(projectPublicPostResponse({
      activity: "detail",
      logicalSlug: "hidden-title",
      requestPath: "/posts/%68idden-title",
      response: {
        kind: "age_locked",
        locked: {
          kind: "age_locked",
          content_rating: "adult_18",
          next_action: { kind: "verify_minimum_age", minimum_age: 18 },
        },
      },
    })).toMatchObject({ kind: "age-locked", status: 200 });
  });

  it("does not call the API for rejected input", async () => {
    const lookup = vi.fn();
    await expect(loadPublicPostBySlug({
      activity: "detail",
      client: { get_publicPostsBySlug: lookup, get_publicPostsByIdPostIdCanonicalRoute: vi.fn() },
      rawSlug: "%252F",
      requestPath: "/posts/%252F",
    })).resolves.toEqual({ kind: "invalid", status: 400 });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("redirects a legacy post-id route only when route authority is present", async () => {
    const route = {
      canonical_path: "/posts/song-title",
      activity_paths: {
        study: "/posts/song-title/study",
        karaoke: "/posts/song-title/karaoke",
        karaoke_leaderboard: "/posts/song-title/karaoke/leaderboard",
      },
    };
    const client = {
      get_publicPostsBySlug: vi.fn(),
      get_publicPostsByIdPostIdCanonicalRoute: vi.fn().mockResolvedValue(contentResponse(route)),
    };
    await expect(loadPublicPostById({
      activity: "karaoke-leaderboard",
      client,
      postId: "post-1",
      requestPath: "/p/post-1/karaoke/leaderboard",
    })).resolves.toEqual({
      kind: "redirect",
      status: 308,
      location: "https://pirate.sc/posts/song-title/karaoke/leaderboard",
    });

    client.get_publicPostsByIdPostIdCanonicalRoute.mockResolvedValue(contentResponse(null));
    await expect(loadPublicPostById({
      activity: "study",
      client,
      postId: "post-1",
      requestPath: "/p/post-1/study",
    })).resolves.toMatchObject({ kind: "content", canonicalPath: null });
  });
});
