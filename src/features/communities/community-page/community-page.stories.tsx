import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { CommunityPage } from "./community-page";
import type { CommunityPageSuccess, CommunityPageViewState } from "./community-page.model";

const rules = [
  { title: "Keep posts on topic", body: "Memes belong in the weekly discussion thread.", position: 1 },
  { title: "Flair your posts", body: "Use the appropriate flair when posting.", position: 2 },
];

const surfaceData = {
  name: "Tame Impala",
  handle: "c/tameimpala",
  description: "Albums, deep cuts, live sessions, and production talk.",
  members: 48_231,
  followers: 92_100,
  posts: [
    {
      id: "apocalypse-dreams",
      title: "Apocalypse Dreams",
      body: "Apocalypse Dreams",
      score: 128,
      publishedAt: "2026-08-28T10:00:00.000Z",
      authorHandle: "midnightwaves.pirate",
      kind: "song" as const,
      mediaTitle: "Apocalypse Dreams",
      mediaArtist: "Tame Impala",
      mediaDuration: "5:56",
      mediaProgress: 62,
      commentCount: 23,
      rewardLabels: ["Learn due"],
      learnAvailable: true,
      karaokeAvailable: true,
    },
    {
      id: "tour-arrangement",
      title: "What is the best Tame Impala live arrangement?",
      body: "The live arrangement left more room for the final chorus. Which version keeps you coming back?",
      score: 42,
      publishedAt: "2026-08-27T10:00:00.000Z",
      authorHandle: "currents.pirate",
      commentCount: 8,
    },
  ],
  rules,
  referenceLinks: [{ href: "https://tameimpala.com", label: "Official site", position: 1 }],
};

function success(
  overrides: Partial<CommunityPageSuccess> = {},
  community: Partial<CommunityPageSuccess["community"]> = {},
): CommunityPageViewState {
  return {
    kind: "success",
    status: 200,
    requestedPathSegment: "night-shift",
    canonicalPath: "/c/night-shift",
    canonicalUrl: "https://pirate.sc/c/night-shift",
    communityId: "community_2f1c9a10-1b2c-4d3e-8f90-abcdef012345",
    routeFamily: "hns",
    routeDisplay: "night-shift",
    community: {
      displayName: "Night Shift",
      description: "A late-night space for music, ideas, and people building after dark.",
      membershipMode: "open",
      memberCount: 1_270,
      followerCount: 18_400,
      rules,
      ...community,
    },
    ...overrides,
  };
}

const meta = {
  title: "Screens/Community/CommunityPage",
  component: CommunityPage,
  args: { pathSegment: "night-shift", data: success() },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof CommunityPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Open community",
  args: { surfaceData },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Tame Impala" })).toBeInTheDocument();
  },
};

export const RequestToJoin: Story = {
  name: "Request to join",
  args: { data: success({}, { membershipMode: "request" }), surfaceData },
};

export const Gated: Story = {
  name: "Gated",
  args: { data: success({}, { membershipMode: "gated" }), surfaceData },
};

/** Counts are nullable, so the page must not render an empty statistic. */
export const WithoutCounts: Story = {
  name: "No member or follower counts",
  args: { data: success({}, { memberCount: null, followerCount: null }) },
};

export const WithoutDescriptionOrRules: Story = {
  name: "No description or rules",
  args: { data: success({}, { description: null, rules: [] }) },
};

/** A community reached by its id rather than a route shows the id form. */
export const CommunityIdRoute: Story = {
  name: "Reached by community id",
  args: {
    pathSegment: "community_2f1c9a10-1b2c-4d3e-8f90-abcdef012345",
    data: success({
      routeFamily: "community_id",
      routeDisplay: "community_2f1c9a10-1b2c-4d3e-8f90-abcdef012345",
      requestedPathSegment: "community_2f1c9a10-1b2c-4d3e-8f90-abcdef012345",
    }),
  },
};

export const NotFound: Story = {
  name: "Not found",
  args: { data: { kind: "not-found", status: 404 } },
};

export const Invalid: Story = {
  name: "Invalid route",
  args: { pathSegment: "not a route", data: { kind: "invalid", status: 400 } },
};

export const Unavailable: Story = {
  name: "Unavailable",
  args: { data: { kind: "unavailable", status: 502 } },
};

export const Mobile: Story = {
  name: "Mobile",
  args: { surfaceData },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
