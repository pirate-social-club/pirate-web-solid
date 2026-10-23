import { renderToString } from "@solidjs/web";
import { afterEach, expect, test, vi } from "vitest";

import type { PublicPostContentResponse, PublicPostRouteState } from "./public-post-route.model.ts";
import { PublicPostRouteView } from "./public-post-route-view.tsx";

function activityState(activity: "study" | "karaoke" | "detail"): PublicPostRouteState {
  const fixture = {
    kind: "content",
    post_id: "song-post",
    content: {
      post: {
        id: "song-post",
        community: "song-community",
        title: "Activity song",
        body: null,
        post_type: "song",
        author_persona: { display_name: "Public creator", primary_public_handle: null },
      },
      resolved_locale: "en",
      translation_state: "same_language",
      translated_title: null,
      translated_body: null,
    },
    route: {
      canonical_path: "/posts/activity-song",
      activity_paths: {
        study: "/posts/activity-song/study",
        karaoke: "/posts/activity-song/karaoke",
        karaoke_leaderboard: "/posts/activity-song/karaoke/leaderboard",
      },
    },
  };
  // SAFETY: the fixture supplies the content and route fields read during SSR;
  // generated-client transport tests own completeness of the wire response.
  const response = JSON.parse(JSON.stringify(fixture)) as PublicPostContentResponse;
  return {
    kind: "content",
    status: 200,
    activity,
    response,
    canonicalPath: "/posts/activity-song",
    canonicalUrl: "https://pirate.sc/posts/activity-song",
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

test.each(["study", "karaoke"] as const)(
  "%s renders its server shell without creating a browser rewards client",
  activity => {
    const fetch = vi.fn(() => Promise.reject(new Error("SSR must not read the optional pool")));
    vi.stubGlobal("fetch", fetch);
    expect(globalThis).not.toHaveProperty("window");
    expect(globalThis).not.toHaveProperty("location");

    const markup = renderToString(() => <PublicPostRouteView state={activityState(activity)} />);

    expect(markup).toContain(`aria-label="Loading ${activity}"`);
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain("data-pool-hold-notice");
    expect(fetch).not.toHaveBeenCalled();
  },
);

test("song detail renders the shared post and counts without private session or vote reads", () => {
  const session = vi.fn(async () => "anonymous" as const);
  const vote = vi.fn(async () => null);
  const fetch = vi.fn(() => Promise.reject(new Error("No browser reads during SSR")));
  vi.stubGlobal("fetch", fetch);
  const markup = renderToString(() => <PublicPostRouteView state={activityState("detail")} engagement={{ resolveSession: session, readViewerVote: vote }} />);
  expect(markup).toContain('data-community-post="song-post"');
  expect(markup).toContain('aria-label="Upvote"');
  expect(markup).toContain('/posts/activity-song/study');
  expect(markup).toContain('/dance/song-community/songs/song-post');
  expect(session).not.toHaveBeenCalled();
  expect(vote).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

test("song reward detail SSR does not construct a browser rewards client", () => {
  vi.stubGlobal("location", undefined);
  const html = renderToString(() => <PublicPostRouteView state={activityState("detail")} />);
  expect(html).not.toContain("You’re entered");
});

test("public choreography credit renders in SSR without a private result or extra fetch",()=>{
 const state=activityState("detail");if(state.kind!=="content")throw new Error("Expected fixture content");
 const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
 const response={...state.response,content:{...state.response.content,post:{...state.response.content.post,post_type:"video" as const},video:{track:"video" as const,caption:null,caption_dir:null,caption_lang:null,
  soundtrack:{kind:"song_reference" as const,song_reference:{song_post_id:"song-post",song_title:"Song",song_author_persona_id:null},render_mode:"canonical_replace" as const},
  dance_credit:{choreography_id:"public-choreography",revision:1,reference_video_post_id:"reference-post"},
  playback:{status:"pending" as const},thumbnail:{status:"pending" as const},data_registration:"registered" as const,capabilities:{can_post_with_song:false}}}};
 const markup=renderToString(()=><PublicPostRouteView state={{...state,response}}/>);
 expect(markup).toContain('href="/post/reference-post"');expect(markup).toContain("View choreography reference");
 expect(markup).not.toMatch(/score_bps|verdict|qualification_ref|review_id/);expect(fetch).not.toHaveBeenCalled();
});
