import userEvent from "@testing-library/user-event";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GetPublicPostsBySlugResponse } from "@pirate/api-client";
import type { PostEngagementTransport } from "../post-engagement/post-engagement-api";
import { createMemoryPendingEngagementStorage, decodePendingEngagementAction } from "../post-engagement/post-engagement-pending";
import { refreshSession } from "../../../api/session.ts";
import { PublicPostRouteView } from "./public-post-route-view.tsx";
import type { PublicPostRouteState } from "./public-post-route.model.ts";

const ageProof = vi.fn(async () => false);

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  ageProof.mockReset().mockResolvedValue(false);
  document.head.replaceChildren();
  document.body.replaceChildren();
});

function render(state: PublicPostRouteState, reload?: Parameters<typeof PublicPostRouteView>[0]["reload"], engagement?: Parameters<typeof PublicPostRouteView>[0]["engagement"]): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose: () => void = () => undefined;
  createRoot(rootDispose => {
    dispose = rootDispose;
    solidRender(() => <PublicPostRouteView state={state} reload={reload} verifyAge={ageProof} engagement={engagement} />, container);
  });
  cleanups.push(() => { dispose(); container.remove(); });
  return container;
}

function contentState(canonical: boolean): PublicPostRouteState {
  const fixture = {
    kind: "content",
    post_id: "post-1",
    content: {
      post: {
        id: "post-1",
        title: "A searchable title",
        body: "A bounded public description.",
        author_persona: { display_name: "Public creator", primary_public_handle: null },
      },
      resolved_locale: "en",
      translation_state: "same_language",
      translated_title: null,
      translated_body: null,
    },
    route: canonical ? {
      canonical_path: "/posts/a-searchable-title",
      activity_paths: {
        study: "/posts/a-searchable-title/study",
        karaoke: "/posts/a-searchable-title/karaoke",
        karaoke_leaderboard: "/posts/a-searchable-title/karaoke/leaderboard",
      },
    } : null,
  };
  // SAFETY: the view fixture supplies every field read by the component; wire
  // completeness belongs to generated-client transport tests.
  const response = JSON.parse(JSON.stringify(fixture)) as Extract<GetPublicPostsBySlugResponse, { kind: "content" }>;
  return {
    kind: "content",
    status: 200,
    activity: "detail",
    response,
    canonicalPath: canonical ? "/posts/a-searchable-title" : null,
    canonicalUrl: canonical ? "https://pirate.sc/posts/a-searchable-title" : null,
  };
}

describe("public post route view", () => {
  it("shows a loading state during session refresh without flashing post unavailable", async () => {
    let finish: ((state: PublicPostRouteState) => void) | undefined;
    const reload = vi.fn(() => new Promise<PublicPostRouteState>(resolve => { finish = resolve; }));
    const container = render(contentState(true), reload);
    refreshSession();
    await vi.waitFor(() => expect(container.querySelector('[role="status"]')?.getAttribute("aria-label")).toBe("Loading post"));
    expect(container.textContent).not.toContain("Post unavailable");
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    finish?.(contentState(true));
    await vi.waitFor(() => expect(container.textContent).toContain("A searchable title"));
    expect(container.textContent).not.toContain("Post unavailable");
  });

  it("renders song playback and API-owned activity paths on the detail page", () => {
    const state = contentState(true);
    if (state.kind !== "content") throw new Error("Expected fixture content");
    const container = render({
      ...state,
      response: {
        ...state.response,
        content: {
          ...state.response.content,
          post: { ...state.response.content.post, post_type: "song", song_title: "A searchable title" },
          song_presentation: { alignment: "ready", data_registration: "pending" },
        },
      },
    });
    expect(container.querySelector("button[aria-label='Play A searchable title']")).not.toBeNull();
    expect(container.querySelector("dl[aria-label='Song delivery status']")).toBeNull();
    expect(container.querySelector("[data-community-post='post-1']")).not.toBeNull();
    expect(container.querySelector("nav[aria-label='Song activities'] a[href='/posts/a-searchable-title/study']")?.textContent).toBe("Study");
    expect(container.querySelector("nav[aria-label='Song activities'] a[href='/posts/a-searchable-title/karaoke']")?.textContent).toBe("Karaoke");
  });

  it.each([
    { alignment: "unavailable", data_registration: "failed" },
    { alignment: "not_applicable", data_registration: "registered" },
  ] as const)("keeps activities while hiding delivery diagnostics", presentation => {
    const state = contentState(true);
    if (state.kind !== "content") throw new Error("Expected fixture content");
    const container = render({ ...state, response: { ...state.response, content: {
      ...state.response.content,
      post: { ...state.response.content.post, post_type: "song" },
      song_presentation: presentation,
    } } });
    expect(container.textContent).not.toContain("Lyrics timing");
    expect(container.textContent).not.toContain("DATA registration");
    expect(container.querySelector("nav[aria-label='Song activities'] a[href$='/study']")).not.toBeNull();
    expect(container.querySelector("nav[aria-label='Song activities'] a[href$='/karaoke']")).not.toBeNull();
  });

  it.each([undefined, null])("keeps activities when delivery status is unavailable", presentation => {
    const state = contentState(true);
    if (state.kind !== "content") throw new Error("Expected fixture content");
    const container = render({ ...state, response: { ...state.response, content: {
      ...state.response.content,
      post: { ...state.response.content.post, post_type: "song" },
      ...(presentation === undefined ? {} : { song_presentation: presentation }),
    } } });
    expect(container.textContent).not.toContain("Lyrics timing");
    expect(container.querySelector("dl[aria-label='Song delivery status']")).toBeNull();
    expect(container.querySelector("nav[aria-label='Song activities'] a[href$='/study']")).not.toBeNull();
    expect(container.querySelector("nav[aria-label='Song activities'] a[href$='/karaoke']")).not.toBeNull();
  });

  it.each(["pending", "ready"] as const)("shows video %s as a safe delivery status without media URLs", status => {
    const state = contentState(true);
    if (state.kind !== "content") throw new Error("Expected fixture content");
    const container = render({ ...state, response: { ...state.response, content: { ...state.response.content,
      post: { ...state.response.content.post, post_type: "video" },
      video: { track: "video", caption: null, caption_dir: null, caption_lang: null,
        soundtrack: { kind: "original_audio", original_sound_id: "sound", origin_video_post_id: "post-1", origin_author_persona_id: "persona" },
        playback: status === "pending" ? { status } : { status, provider: "stream", playback_ref: "bare-stream-uid" },
        thumbnail: status === "pending" ? { status } : { status, artifact_ref: "media://derived/poster" },
        data_registration: "registered", capabilities: { can_post_with_song: false },
      },
    } } });
    if (status === "pending") {
      expect(container.textContent).toContain("Playback is being prepared");
      expect(container.querySelector("video, iframe, img")).toBeNull();
    } else expect(container.querySelector("video")?.getAttribute("src")).toBeNull();
    expect(container.innerHTML).not.toContain("bare-stream-uid"); expect(container.innerHTML).not.toContain("media://");
  });
  it("renders public content with canonical and Open Graph metadata", async () => {
    const container = render(contentState(true));
    expect(container.textContent).toContain("A searchable title");
    expect(container.textContent).toContain("Public creator");
    await vi.waitFor(() => expect(document.head.querySelector("link[rel='canonical']")?.getAttribute("href"))
      .toBe("https://pirate.sc/posts/a-searchable-title"));
    expect(document.head.querySelector("meta[property='og:url']")?.getAttribute("content"))
      .toBe("https://pirate.sc/posts/a-searchable-title");
  });

  it("renders guarded content as noindex without title-derived metadata", async () => {
    const container = render(contentState(false));
    expect(container.textContent).toContain("A searchable title");
    await vi.waitFor(() => expect(document.head.querySelector("meta[name='robots']")?.getAttribute("content"))
      .toBe("noindex, nofollow"));
    expect(document.head.querySelector("link[rel='canonical']")).toBeNull();
    expect(document.head.querySelector("meta[property='og:url']")).toBeNull();
  });

  it("keeps the age-lock placeholder content-free and unlinked", async () => {
    const container = render({
      kind: "age-locked",
      status: 200,
      activity: "detail",
      locked: {
        kind: "age_locked",
        content_rating: "adult_18",
        next_action: { kind: "verify_minimum_age", minimum_age: 18 },
      },
    });
    expect(container.textContent).toContain("Age verification required");
    expect(container.textContent).not.toContain("A searchable title");
    await vi.waitFor(() => expect(document.head.querySelector("meta[name='robots']")).not.toBeNull());
    expect(document.head.querySelector("link[rel='canonical'], meta[property^='og:']")).toBeNull();
  });
});


it("unlocks post detail only after proof and a fresh guarded read, without navigation", async () => {
  ageProof.mockResolvedValue(true);
  const reload = vi.fn(async () => contentState(true));
  const before = location.href;
  const container = render({ kind: "age-locked", status: 200, activity: "detail", locked: { kind: "age_locked", content_rating: "adult_18", next_action: { kind: "verify_minimum_age", minimum_age: 18 } } }, reload);
  await vi.waitFor(() => expect(container.textContent).toContain("Verify 18+ to view"));
  expect(container.textContent).not.toContain("A searchable title");
  container.querySelector("button")?.click();
  await vi.waitFor(() => expect(container.textContent).toContain("A searchable title"));
  expect(reload).toHaveBeenCalledOnce();
  expect(location.href).toBe(before);
});

it("uses the standard song post card and opens its persisted comment thread", async () => {
  window.scrollTo = vi.fn();
  const state = contentState(true);
  if (state.kind !== "content") throw new Error("Expected content");
  const readComments = vi.fn(async () => ({ items: [{ comment_id: "comment", parent_comment_id: null, body: "A real thread", depth: 0, reply_count: 0, status: "published" as const, content_rating: "general" as const, created_at: "2026-09-29T00:00:00Z", author_persona: null }], next_cursor: null }));
  const createComment = vi.fn<PostEngagementTransport["createComment"]>(async () => ({ submission_id: "submission", href: "/comments/new", surface: "comment" as const, status: "published" as const, result: { decision: "allow" as const, reason_code: null }, review_ref: null, created_at: "2026-09-30T00:00:00Z", updated_at: "2026-09-30T00:00:00Z", published_resource: { kind: "comment" as const, comment_id: "new", href: "/comments/new" } }));
  const container = render({ ...state, response: { ...state.response, content: { ...state.response.content, post: { ...state.response.content.post, community: "community", post_type: "song", created: 1_790_720_000 }, upvote_count: 3, downvote_count: 1, comment_count: 1 } } }, undefined, {
    resolveSession: async () => ({ status: "authenticated", userId: "account", personas: [{ personaId: "profile", displayName: "Profile", avatarRef: null, primaryPublicHandle: null, communityBinding: { communityId: "community", bindingSource: "first_membership" } }] }),
    readViewerVote: async () => 1, readComments, pendingStorage: createMemoryPendingEngagementStorage(),
    transport: { reportPost: vi.fn(), createComment, createReply: vi.fn(), castVote: vi.fn(), clearVote: vi.fn(), reportComment: vi.fn(), readModerationCase: vi.fn(), moderateCase: vi.fn(), readSubmission: vi.fn() },
  });
  expect(container.querySelector("[data-community-post='post-1']")).not.toBeNull();
  await vi.waitFor(() => expect(container.querySelector<HTMLButtonElement>("button[aria-label='Comments (1)']")?.disabled).toBe(false));
  container.querySelector<HTMLButtonElement>("button[aria-label='Comments (1)']")!.click();
  await vi.waitFor(() => expect(document.body.textContent).toContain("A real thread"));
  const input = document.querySelector<HTMLTextAreaElement>("textarea")!;
  input.value = "After studying"; input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  await vi.waitFor(() => expect([...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Post comment")?.disabled).toBe(false));
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Post comment")!.click();
  await vi.waitFor(() => expect(createComment).toHaveBeenCalledOnce());
  expect(await decodePendingEngagementAction(createComment.mock.calls[0]![0])).toMatchObject({ kind: "comment", personaId: "profile", postId: "post-1", body: "After studying" });
});

it("waits for the private vote and never treats a failed read as an unvoted account", async () => {
  const state = contentState(true);
  if (state.kind !== "content") throw new Error("Expected content");
  const readViewerVote = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(-1);
  const container = render({ ...state, response: { ...state.response, content: { ...state.response.content, post: { ...state.response.content.post, community: "community", post_type: "song" } } } }, undefined, {
    resolveSession: async () => ({ status: "authenticated", userId: "account", personas: [] }),
    readViewerVote, pendingStorage: createMemoryPendingEngagementStorage(),
  });
  expect(container.querySelector<HTMLButtonElement>("button[aria-label^='Comments']")?.disabled).toBe(true);
  await vi.waitFor(() => expect(container.textContent).toContain("Your post actions could not be checked"));
  expect(container.querySelector<HTMLButtonElement>("button[aria-label^='Comments']")?.disabled).toBe(true);
  [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Retry")!.click();
  await vi.waitFor(() => expect(container.querySelector<HTMLButtonElement>("button[aria-label^='Comments']")?.disabled).toBe(false));
  expect(readViewerVote).toHaveBeenCalledTimes(2);
});

it("wires text votes, comments and supported post reports", async () => {
  const postType = "text";
  window.scrollTo = vi.fn();
  const state = contentState(true);
  if (state.kind !== "content") throw new Error("Expected content");
  const castVote = vi.fn<PostEngagementTransport["castVote"]>(async () => ({ post_id: "post-1", value: 1 }));
  const readComments = vi.fn(async () => ({ items: [], next_cursor: null }));
  const container = render({ ...state, response: { ...state.response, content: { ...state.response.content,
    post: { ...state.response.content.post, community: "community", post_type: postType }, upvote_count: 0, downvote_count: 0, comment_count: 0 } } }, undefined, {
    resolveSession: async () => ({ status: "authenticated", userId: "account", personas: [] }),
    readViewerVote: async () => null, readComments, pendingStorage: createMemoryPendingEngagementStorage(),
    transport: { castVote, reportPost: vi.fn(), createComment: vi.fn(), createReply: vi.fn(), clearVote: vi.fn(), reportComment: vi.fn(), readModerationCase: vi.fn(), moderateCase: vi.fn(), readSubmission: vi.fn() },
  });
  await vi.waitFor(() => expect(container.querySelector<HTMLButtonElement>("button[aria-label='Upvote']")?.disabled).toBe(false));
  expect(container.querySelector("button[aria-label='Post options']") !== null).toBe(postType === "text");
  await userEvent.click(container.querySelector("button[aria-label='Upvote']")!);
  await vi.waitFor(() => expect(castVote).toHaveBeenCalledOnce());
  await userEvent.click(container.querySelector("button[aria-label='Comments (0)']")!);
  await vi.waitFor(() => expect(readComments).toHaveBeenCalledOnce());
});

it("leaves video details without engagement or private session reads", async () => {
  const state = contentState(true);
  if (state.kind !== "content") throw new Error("Expected content");
  const resolveSession = vi.fn(async () => "anonymous" as const);
  const container = render({ ...state, response: { ...state.response, content: { ...state.response.content,
    post: { ...state.response.content.post, post_type: "video" } } } }, undefined, { resolveSession });
  await vi.waitFor(() => expect(container.querySelector("[data-public-post-state='content']")).not.toBeNull());
  expect(container.querySelector("button[aria-label='Upvote'], button[aria-label^='Comments'], button[aria-label='Post options']")).toBeNull();
  expect(resolveSession).not.toHaveBeenCalled();
});
