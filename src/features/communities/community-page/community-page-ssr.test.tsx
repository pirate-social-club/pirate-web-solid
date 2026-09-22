import type {
  GetCPathSegmentResponse,
  GetCommunitiesCommunityIdPreviewResponse,
} from "@pirate/api-client";
import { createRequestEvent, renderToStream, type JSX } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { describe, expect, test, vi } from "vitest";

import type { CommunityEngagementApi } from "./community-engagement-api.ts";
import type { CommunityThreadPage } from "./community-thread-feed-api.ts";
import CommunityPage from "./community-page.tsx";

const communityId = "community_123e4567-e89b-42d3-a456-426614174000";

const route: GetCPathSegmentResponse = {
  community_id: communityId,
  canonical_route: {
    family: "hns",
    root_label: "harbor",
    root_label_display: "harbor",
    path_segment: "harbor",
    href: "/c/harbor",
    app_host: "app.harbor",
  },
};

const preview: GetCommunitiesCommunityIdPreviewResponse = {
  id: communityId,
  object: "community_preview",
  display_name: "Pirate Harbor",
  description: "Public conversations.",
  membership_mode: "open",
  human_verification_lane: null,
  member_count: 12,
  follower_count: 20,
  moderators: [],
  membership_gate_summaries: [],
  rules: [],
  created: 1_700_000_000,
};

const client = {
  get_cPathSegment: async () => route,
  get_communitiesCommunityIdPreview: async () => preview,
};

const handleSalesClient = {
  get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }),
};

/** The server knows no viewer, so nothing here should ever be called. */
const engagementApi: CommunityEngagementApi = {
  readViewerState: vi.fn(async () => { throw new Error("no viewer on the server"); }),
  resolveJoinAction: vi.fn(async () => { throw new Error("no viewer on the server"); }),
  join: vi.fn(async () => { throw new Error("no viewer on the server"); }),
  follow: vi.fn(async () => { throw new Error("no viewer on the server"); }),
  unfollow: vi.fn(async () => { throw new Error("no viewer on the server"); }),
};

const thread = (title: string) => ({
  id: `thread-${title}`,
  title,
  body: "Public feed content.",
  score: 3,
  publishedAt: "2026-09-01T18:00:00.000Z",
  commentCount: 0,
});

const emptyFeed = async (): Promise<CommunityThreadPage> => ({ posts: [], nextCursor: null });

/**
 * Renders the page the way the server does. `shell` is the first flush, which
 * is what a reader receives before any client code runs, so content that
 * reaches only `settled` is content the reader would watch appear.
 */
interface ServerResponse {
  readonly settled: string;
  readonly shell: string;
  readonly errors: readonly unknown[];
}

async function serverRender(ui: () => JSX.Element): Promise<ServerResponse> {
  const errors: unknown[] = [];
  const chunks: string[] = [];
  // onCompleteShell runs before the shell chunk is emitted, so mark the
  // boundary from inside it rather than counting chunks.
  const shellEnd = "<!--shell-end-->";
  const stream = renderToStream(ui, {
    noScripts: true,
    onError: (error: unknown) => { errors.push(error); },
    onCompleteShell: ({ write }) => { write(shellEnd); },
  });
  await new Promise<void>(resolve => {
    stream.pipe({
      write: (value: string) => { chunks.push(value); },
      end: () => resolve(),
    });
  });
  const settled = chunks.join("");
  const boundary = settled.indexOf(shellEnd);
  return {
    settled,
    shell: boundary === -1 ? settled : settled.slice(0, boundary),
    errors,
  };
}

type PageOverrides = Partial<Parameters<typeof CommunityPage>[0]>;

function page(overrides: PageOverrides = {}) {
  return (): JSX.Element => (
    <CommunityPage
      client={client}
      engagementApi={engagementApi}
      handleSalesClient={handleSalesClient}
      pathSegment="harbor"
      {...overrides}
    />
  );
}

describe("the feed the server sends", () => {
  test("the default loader renders public posts through the request-origin proxy during SSR", async () => {
    const origin = "https://community-ssr.example";
    const feedPath = `/api/public-communities/${communityId}/feed`;
    const network = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      expect(url.origin).toBe(origin);
      expect(init?.credentials).toBe("omit");
      if (url.pathname === "/api/c/harbor") return Response.json(route);
      if (url.pathname === `/api/communities/${communityId}/preview`) return Response.json(preview);
      if (url.pathname === `/api/communities/${communityId}/handle-offerings`) {
        return Response.json({ items: [], next_cursor: null });
      }
      if (url.pathname === feedPath) {
        expect(Object.fromEntries(url.searchParams)).toEqual({ surface: "threads", sort: "new", locale: "en" });
        return Response.json({
          community: preview,
          items: [{
            post: {
              id: "post-public-ssr", object: "post", community: communityId,
              authorship_mode: "human_direct", identity_mode: "public", post_type: "text",
              status: "published", visibility: "public", analysis_state: "allow",
              content_safety_state: "safe", age_gate_policy: "none", created: 1_756_752_000,
              title: "Public default-loader thread", body: "Visible without a session.",
            },
            thread_snapshot: null, upvote_count: 3, downvote_count: 0, like_count: 0,
            viewer_vote: null, viewer_reaction_kinds: [], resolved_locale: "en",
            translation_state: "ready", machine_translated: false, source_hash: null,
          }],
          next_cursor: null,
        });
      }
      throw new Error(`Unexpected SSR request: ${url.pathname}`);
    });
    try {
      const { settled, errors } = await provideRequestEvent(
        createRequestEvent(new Request(`${origin}/c/harbor`)),
        () => serverRender(() => <CommunityPage pathSegment="harbor" />),
      );
      expect(errors).toEqual([]);
      expect(settled).toContain("Public default-loader thread");
      expect(settled).not.toContain("Community posts are temporarily unavailable");
      expect(network.mock.calls.filter(([input]) => new URL(input instanceof Request ? input.url : input.toString()).pathname === feedPath)).toHaveLength(1);
    } finally {
      network.mockRestore();
    }
  });

  test("a non-empty feed is in the first flush, not added afterwards", async () => {
    const loadThreads = vi.fn(async (): Promise<CommunityThreadPage> => ({
      posts: [thread("Harbor thread")],
      nextCursor: null,
    }));
    const { shell, settled, errors } = await serverRender(page({ loadThreads }));

    expect(errors).toEqual([]);
    expect(shell).toContain("Harbor thread");
    expect(settled).toContain("Harbor thread");
    expect(settled).not.toContain("No posts in this community yet");
    expect(settled).not.toContain("Loading community posts");
    expect(loadThreads).toHaveBeenCalledWith(communityId);
  });

  test("an empty feed is stated because it was read, not because it was unread", async () => {
    const loadThreads = vi.fn(emptyFeed);
    const { shell, errors } = await serverRender(page({ loadThreads }));

    expect(errors).toEqual([]);
    expect(loadThreads).toHaveBeenCalledWith(communityId);
    expect(shell).toContain("No posts in this community yet");
    expect(shell).not.toContain("Loading community posts");
  });

  test("a failed read is reported honestly rather than as an empty feed", async () => {
    const loadThreads = vi.fn(async (): Promise<CommunityThreadPage> => {
      throw new Error("thread read failed");
    });
    const { shell, errors } = await serverRender(page({ loadThreads }));

    expect(errors).toEqual([]);
    expect(shell).toContain("Community posts are temporarily unavailable");
    expect(shell).not.toContain("No posts in this community yet");
  });

  test("posts injected by the host are served without reading anything", async () => {
    const loadThreads = vi.fn(emptyFeed);
    const { shell } = await serverRender(page({
      loadThreads,
      surfaceData: { posts: [thread("Injected thread")] },
    }));

    expect(shell).toContain("Injected thread");
    expect(shell).not.toContain("Loading community posts");
    expect(loadThreads).not.toHaveBeenCalled();
  });
});

describe("the private controls the server sends", () => {
  test("no membership or authority is claimed for a viewer the server does not know", async () => {
    const { shell } = await serverRender(page({ loadThreads: emptyFeed }));

    // "Join" would say this reader is not a member and "Joined" would say they
    // are. The server knows neither.
    expect(shell).toContain("Checking…");
    expect(shell).not.toContain(">Join<");
    expect(shell).not.toContain(">Joined<");
    expect(shell).not.toContain("Post");
    expect(shell).not.toContain(">Manage<");
    expect(shell).not.toContain(">Follow<");
    expect(shell).not.toContain(">Following<");
  });

  test("the header carries two fixed slots and nothing conditional", async () => {
    const { shell } = await serverRender(page({ loadThreads: emptyFeed }));

    // Both slots ship in the response at their final size, and the controls
    // whose existence depends on authority are not in the header at all.
    expect(shell).toContain("data-community-follow-slot");
    expect(shell).toContain("data-community-membership-slot");
    expect(shell).toContain("data-community-manage=\"pending\"");
    // Outcomes are announced through the toast region, which the server has
    // nothing to say into, so the response carries no feedback block at all.
    expect(shell).not.toContain("data-community-feedback");
  });
});
