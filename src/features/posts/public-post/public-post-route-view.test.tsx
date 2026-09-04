import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GetPublicPostsBySlugResponse } from "@pirate/api-client";
import { PublicPostRouteView } from "./public-post-route-view.tsx";
import type { PublicPostRouteState } from "./public-post-route.model.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

function render(state: PublicPostRouteState): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose: () => void = () => undefined;
  createRoot(rootDispose => {
    dispose = rootDispose;
    solidRender(() => <PublicPostRouteView state={state} />, container);
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
