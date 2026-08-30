/* oxlint-disable anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- structural SSR primitives are isolated test adapters. */

import { afterAll, describe, expect, mock, test } from "bun:test";
import { renderToString, ssrElement } from "@solidjs/web";
import { createComponent } from "solid-js";

import type { ApiKaraokeLeaderboard } from "./karaoke-api";

const designSystemPath = new URL("../../design-system.ts", import.meta.url).pathname;
const jsxRuntimePath = new URL("../../../node_modules/@solidjs/web/types/jsx.d.ts", import.meta.url).pathname;

function element(tag: string, props: Record<string, unknown>) {
  const { children, class: className, ...rest } = props;
  return ssrElement(tag, { ...rest, ...(className ? { class: className } : {}) }, children, false);
}

const primitive = (tag: string) => (props: Record<string, unknown>) => element(tag, props);

mock.module(designSystemPath, () => ({
  Avatar: primitive("span"),
  Button: primitive("button"),
  Card: primitive("section"),
  CardContent: primitive("div"),
  CardHeader: primitive("header"),
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  createMediaQuery: () => () => false,
  IconButton: primitive("button"),
  IconArrowsClockwise: primitive("svg"),
  IconCaretLeft: primitive("svg"),
  IconCheckCircle: primitive("svg"),
  IconCrown: primitive("svg"),
  IconFire: primitive("svg"),
  IconLock: primitive("svg"),
  IconMicrophone: primitive("svg"),
  IconSquare: primitive("svg"),
  IconWarningCircle: primitive("svg"),
  IconX: primitive("svg"),
  Spinner: primitive("span"),
  Type: (props: Record<string, unknown>) => element(String(props.as ?? "span"), props),
}));

mock.module(jsxRuntimePath, () => ({
  Fragment: (props: { children?: unknown }) => props.children,
  jsx: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
  jsxs: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
  jsxDEV: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
}));

const { KaraokeLeaderboard } = await import("./karaoke-leaderboard");

const leaderboard: ApiKaraokeLeaderboard = {
  object: "karaoke_song_leaderboard",
  post_id: "post-1",
  community_id: "community-1",
  scope: "all_time",
  karaoke_revision_id: "revision-1",
  scoring_version: 1,
  scoring_provider: "provider",
  scoring_model: "model",
  total_ranked: 1,
  entries: [{
    rank: 1,
    top_percent: 5,
    score: 9800,
    reached_at: "2026-08-19T00:00:00Z",
    identity: { visibility: "visible", display_name: "Aria", handle: "aria", avatar_ref: null },
    is_viewer: true,
  }],
  viewer_rank: 1,
  viewer_top_percent: 5,
  viewer_best_score: 9800,
  viewer_best_reached_at: "2026-08-19T00:00:00Z",
  viewer_eligible_attempt_count: 1,
};

describe("KaraokeLeaderboard rendered semantics", () => {
  test("uses a semantic leaderboard heading and readable score token", () => {
    const html = renderToString(() => createComponent(KaraokeLeaderboard, {
      leaderboard,
      title: "Paper Moon",
    }));

    expect(html).toMatch(/<h1[^>]*>Leaderboard<\/h1>/u);
    expect(html).toContain("text-foreground");
  });
});

afterAll(() => mock.restore());
