import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GetPublicPostsBySlugResponse } from "@pirate/api-client";
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

function render(state: PublicPostRouteState, reload?: Parameters<typeof PublicPostRouteView>[0]["reload"]): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose: () => void = () => undefined;
  createRoot(rootDispose => {
    dispose = rootDispose;
    solidRender(() => <PublicPostRouteView state={state} reload={reload} verifyAge={ageProof} />, container);
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
    await vi.waitFor(() => expect(container.textContent).toContain("Loading post"));
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
    expect(container.textContent).toContain("Play song");
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
