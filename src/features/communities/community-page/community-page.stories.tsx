import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { toast } from "../../../design-system";

import type { SessionResolution } from "../../../api/session.ts";
import {
  CommunityPage,
} from "./community-page";
import type {
  CommunityEngagementApi,
  CommunityJoinAction,
} from "./community-engagement-api.ts";
import type { CommunityPageSuccess } from "./community-page.model";

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
      body: "The build on this one still surprises me.",
      score: 128,
      publishedAt: "2026-08-28T10:00:00.000Z",
      authorHandle: "midnightwaves.pirate",
      kind: "song" as const,
      mediaTitle: "Apocalypse Dreams",
      mediaArtist: "Tame Impala",
      commentCount: 23,
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
): CommunityPageSuccess {
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

/** Without a session fake the page waits on a real client and every button stays on "Checking…". */
const anonymousSession = (): Promise<SessionResolution> => Promise.resolve("anonymous");

/**
 * A settled non-member viewer, so each story shows the join label it is named
 * for instead of a pending read. Actions answer in kind; nothing here touches
 * the network.
 */
function settledEngagement(joinAction: CommunityJoinAction): CommunityEngagementApi {
  let following = false;
  let followerCount: number | null = 92_100;
  return {
    readViewerState: async () => ({ membership: "not_member", following, followerCount }),
    resolveJoinAction: async () => joinAction,
    join: async () => ({ status: "joined", personaId: null }),
    follow: async () => {
      following = true;
      followerCount = (followerCount ?? 0) + 1;
      return { following, followerCount };
    },
    unfollow: async () => {
      following = false;
      followerCount = Math.max(0, (followerCount ?? 1) - 1);
      return { following, followerCount };
    },
  };
}

const settledLoad = async () => ({ posts: [], nextCursor: null });

const meta = {
  title: "Screens/Community/CommunityPage",
  component: CommunityPage,
  args: { pathSegment: "night-shift", data: success() },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof CommunityPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StandalonePostingProfiles: Story = {
  args: {
    surfaceData: { ...surfaceData, posts: [] },
    engagementApi: settledEngagement({ kind: "join" }),
    loadThreads: settledLoad,
    resolveOwnerSettingsAccess: async () => false,
    handleSalesClient: { get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) },
    resolveSession: async () => ({
      status: "authenticated",
      userId: "storybook-account",
      personas: ["Harbor", "Night Shift"].map((displayName, index) => ({
        personaId: `storybook-persona-${index}`,
        displayName,
        avatarRef: null,
        primaryPublicHandle: null,
        communityBinding: { communityId: success().communityId, bindingSource: "first_membership" },
      })),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const control = await canvas.findByRole("button", { name: "Switch posting profile" });
    await userEvent.click(control);
    const picker = await body.findByRole("dialog");
    await userEvent.click(within(picker).getByRole("radio", { name: /Night Shift/ }));
    await expect(control).toHaveAttribute("title", "Posting as Night Shift");
    const id = toast.info("Posting profile selected", { duration: 60000 });
    try {
      const status = await body.findByRole("status", { name: "Posting profile selected" });
      await waitFor(() => {
        const feedback = status.getBoundingClientRect();
        const profile = control.getBoundingClientRect();
        const separated = feedback.right <= profile.left || profile.right <= feedback.left || feedback.bottom <= profile.top || profile.bottom <= feedback.top;
        expect(separated).toBe(true);
      });
    } finally { toast.dismiss(id); }
  },
};

export const StandalonePostingProfilesMobile: Story = {
  ...StandalonePostingProfiles,
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const Default: Story = {
  name: "Open community",
  args: {
    surfaceData,
    engagementApi: settledEngagement({ kind: "join" }),
    loadThreads: settledLoad,
    resolveSession: anonymousSession,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Tame Impala" })).toBeInTheDocument();
  },
};

export const RequestToJoin: Story = {
  name: "Request to join",
  args: {
    data: success({}, { membershipMode: "request" }),
    surfaceData,
    engagementApi: settledEngagement({ kind: "request" }),
    loadThreads: settledLoad,
    resolveSession: anonymousSession,
  },
};

export const Gated: Story = {
  name: "Gated",
  args: {
    data: success({}, { membershipMode: "gated" }),
    surfaceData,
    engagementApi: settledEngagement({ kind: "verify", providerId: "very", intentId: "storybook-intent" }),
    loadThreads: settledLoad,
    resolveSession: anonymousSession,
  },
};

/** Counts are nullable, so the page must not render an empty statistic. */
export const WithoutCounts: Story = {
  name: "No member or follower counts",
  args: {
    data: success({}, { memberCount: null, followerCount: null }),
    engagementApi: settledEngagement({ kind: "join" }),
    loadThreads: settledLoad,
    resolveSession: anonymousSession,
  },
};

export const WithoutDescriptionOrRules: Story = {
  name: "No description or rules",
  args: {
    data: success({}, { description: null, rules: [] }),
    engagementApi: settledEngagement({ kind: "join" }),
    loadThreads: settledLoad,
    resolveSession: anonymousSession,
  },
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
    engagementApi: settledEngagement({ kind: "join" }),
    loadThreads: settledLoad,
    resolveSession: anonymousSession,
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
  args: {
    surfaceData,
    engagementApi: settledEngagement({ kind: "join" }),
    loadThreads: settledLoad,
    resolveSession: anonymousSession,
  },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

// Paper states (Screens/Community/CommunityPage, 2026-10-12 handoff): the
// production page with explicit engagement fakes, one per viewer.

const paperData = success({}, {
  displayName: "Harbor Collective",
  description: "Songs, covers and late-night takes from the harbor.",
  membershipMode: "open",
  memberCount: 1_204,
  followerCount: 310,
  rules: [{ title: "Post your own work", body: "Covers are welcome. Credit the song." }],
});
const paperPhone = { viewport: { value: "mobile1", isRotated: false } } as const;
const settle = { timeout: 15_000 };

/** Calls the Paper stories assert; reset by each play that reads them. */
const paperCalls = { follow: 0, unfollow: 0, manage: 0 };

/** A settled viewer with the given standing; follow writes are counted. */
function viewerEngagement(standing: { member: boolean; following: boolean }): CommunityEngagementApi {
  let following = standing.following;
  let followerCount: number | null = 310;
  return {
    readViewerState: async () => ({ membership: standing.member ? "member" : "not_member", following, followerCount }),
    resolveJoinAction: async () => ({ kind: "join" }),
    join: async () => ({ status: "joined", personaId: null }),
    follow: async () => {
      paperCalls.follow += 1;
      following = true;
      followerCount = (followerCount ?? 0) + 1;
      return { following, followerCount };
    },
    unfollow: async () => {
      paperCalls.unfollow += 1;
      following = false;
      followerCount = Math.max(0, (followerCount ?? 1) - 1);
      return { following, followerCount };
    },
  };
}

/** One profile bound to this community, so a member has a profile here. */
const memberSession = async (): Promise<SessionResolution> => ({
  status: "authenticated",
  userId: "storybook-member",
  personas: [{
    personaId: "storybook-harbor",
    displayName: "Harbor",
    avatarRef: null,
    primaryPublicHandle: null,
    communityBinding: { communityId: paperData.communityId, bindingSource: "first_membership" },
  }],
});

const noOfferings = { get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) };

/** The More trigger the current viewport shows (menu on desktop, sheet on a phone). */
async function visibleMoreTrigger(canvasElement: HTMLElement): Promise<HTMLElement> {
  const canvas = within(canvasElement);
  return waitFor(() => {
    const trigger = canvas.getAllByRole("button", { name: "More community options" }).find(button => button.getBoundingClientRect().width > 0);
    if (trigger === undefined) throw new Error("No visible More trigger yet");
    return trigger;
  }, settle);
}

/** Replaces a navigator member for one play, returning the restore step. */
function stubNavigator(key: "share" | "clipboard", value: object | undefined): () => void {
  const own = Object.getOwnPropertyDescriptor(navigator, key);
  Object.defineProperty(navigator, key, { configurable: true, value });
  return () => {
    if (own === undefined) Reflect.deleteProperty(navigator, key);
    else Object.defineProperty(navigator, key, own);
  };
}

/** 178: a visitor sees Follow and Join; More holds Share only. */
export const PaperVisitor: Story = {
  name: "Paper / Visitor",
  args: {
    data: paperData,
    engagementApi: viewerEngagement({ member: false, following: false }),
    loadThreads: settledLoad,
    resolveSession: anonymousSession,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByRole("button", { name: "Follow this community" }, settle)).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Join" })).toBeVisible();
    await expect(canvasElement.querySelector("[data-community-profile-control]")).toBeNull();
    await userEvent.click(await visibleMoreTrigger(canvasElement));
    const menu = await body.findByRole("menu", {}, settle);
    await expect(within(menu).getAllByRole("menuitem").map(item => item.textContent?.trim())).toEqual(["Share"]);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByRole("menu")).not.toBeInTheDocument());
  },
};

/** 179: a follower who has not joined has Join across the row; Unfollow is in More. */
export const PaperFollowingNotMember: Story = {
  name: "Paper / Following, not a member",
  args: {
    data: paperData,
    engagementApi: viewerEngagement({ member: false, following: true }),
    loadThreads: settledLoad,
    resolveSession: memberSession,
    handleSalesClient: noOfferings,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    paperCalls.unfollow = 0;
    const join = await canvas.findByRole("button", { name: "Join" }, settle);
    await expect(join.className).toContain("col-span-2");
    await expect(canvas.queryByRole("button", { name: "Unfollow this community" })).not.toBeInTheDocument();
    await userEvent.click(await visibleMoreTrigger(canvasElement));
    const menu = await body.findByRole("menu", {}, settle);
    await expect(within(menu).getAllByRole("menuitem").map(item => item.textContent?.trim())).toEqual(["Share", "Unfollow"]);
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Unfollow" }));
    await waitFor(() => expect(paperCalls.unfollow).toBe(1));
    await expect(await canvas.findByRole("button", { name: "Follow this community" }, settle)).toBeVisible();
  },
};

/** 180/183: a member has Post, and their profile here in the banner beside More. */
export const PaperMember: Story = {
  name: "Paper / Member with profile",
  args: {
    data: paperData,
    engagementApi: viewerEngagement({ member: true, following: true }),
    loadThreads: settledLoad,
    resolveSession: memberSession,
    handleSalesClient: noOfferings,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Post" }, settle)).toBeVisible();
    const profile = await canvas.findByRole("button", { name: "Open posting profile" }, settle);
    await expect(profile.closest("[data-community-banner-actions]")).not.toBeNull();
    await expect(profile).toHaveAttribute("title", "Posting as Harbor");
    const more = await visibleMoreTrigger(canvasElement);
    // Profile is the banner's outer control, More just inside it.
    await expect(more.getBoundingClientRect().right).toBeLessThan(profile.getBoundingClientRect().left);
    await expect(canvasElement.ownerDocument.querySelector("[data-community-profile-control]:not([data-community-profile-control='banner'])")).toBeNull();
  },
};

/** 185: the member on a phone. */
export const PaperMemberPhone: Story = {
  ...PaperMember,
  name: "Paper / Member with profile, phone",
  globals: paperPhone,
};

/** 181: More on desktop for a manager, with Share answered by the platform share sheet. */
export const PaperMoreDesktop: Story = {
  name: "Paper / More menu, desktop",
  args: {
    data: paperData,
    engagementApi: viewerEngagement({ member: true, following: true }),
    loadThreads: settledLoad,
    resolveSession: memberSession,
    resolveOwnerSettingsAccess: async () => true,
    navigate: () => { paperCalls.manage += 1; },
    handleSalesClient: noOfferings,
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const shared: ShareData[] = [];
    const restore = stubNavigator("share", async (data: ShareData) => { shared.push(data); });
    try {
      const trigger = await visibleMoreTrigger(canvasElement);
      await waitFor(() => expect(trigger).toHaveAttribute("data-community-manage", "available"));
      await userEvent.click(trigger);
      const menu = await body.findByRole("menu", {}, settle);
      await expect(within(menu).getAllByRole("menuitem").map(item => item.textContent?.trim())).toEqual(["Share", "Manage"]);
      await expect(menu.getBoundingClientRect().width).toBe(208);
      await userEvent.click(within(menu).getByRole("menuitem", { name: "Share" }));
      await waitFor(() => expect(shared).toEqual([{ title: "Harbor Collective", url: "https://pirate.sc/c/night-shift" }]));
      paperCalls.manage = 0;
      await userEvent.click(trigger);
      await userEvent.click(await body.findByRole("menuitem", { name: "Manage" }));
      await waitFor(() => expect(paperCalls.manage).toBe(1));
    } finally { restore(); }
  },
};

/** 182: More as a phone sheet for a follower, with Share falling back to the clipboard. */
export const PaperMorePhone: Story = {
  name: "Paper / More sheet, phone",
  globals: paperPhone,
  args: {
    data: paperData,
    engagementApi: viewerEngagement({ member: false, following: true }),
    loadThreads: settledLoad,
    resolveSession: memberSession,
    handleSalesClient: noOfferings,
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(canvasElement.ownerDocument.defaultView?.matchMedia("(max-width: 767px)").matches).toBe(true));
    const copied: string[] = [];
    const restoreShare = stubNavigator("share", undefined);
    const restoreClipboard = stubNavigator("clipboard", { writeText: async (text: string) => { copied.push(text); } });
    try {
      await userEvent.click(await visibleMoreTrigger(canvasElement));
      const sheet = await body.findByRole("dialog", { name: "More community options" }, settle);
      const rows = [...sheet.querySelectorAll("[data-community-more-action]")].map(row => row.textContent);
      await expect(rows).toEqual(["Share", "Unfollow"]);
      await userEvent.click(within(sheet).getByRole("button", { name: "Share" }));
      await waitFor(() => expect(copied).toEqual(["https://pirate.sc/c/night-shift"]));
      await expect(await body.findByText("Link copied")).toBeInTheDocument();
      await waitFor(() => expect(body.queryByRole("dialog", { name: "More community options" })).not.toBeInTheDocument());
    } finally { restoreShare(); restoreClipboard(); }
  },
};

/** 186: a visitor on the phone's About tab. */
export const PaperAboutPhone: Story = {
  name: "Paper / About tab, phone",
  globals: paperPhone,
  args: {
    data: paperData,
    engagementApi: viewerEngagement({ member: false, following: false }),
    loadThreads: settledLoad,
    resolveSession: anonymousSession,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvasElement.ownerDocument.defaultView?.matchMedia("(max-width: 767px)").matches).toBe(true));
    await userEvent.click(await canvas.findByRole("button", { name: "About" }, settle));
    const about = canvasElement.querySelector<HTMLElement>("[data-community-about]");
    if (about === null) throw new Error("Expected the About view");
    await expect(within(about).getByText("Rules")).toBeVisible();
    await expect(within(about).getByText("Anyone can join.")).toBeVisible();
    await expect(within(about).queryByText("Community rules")).not.toBeInTheDocument();
  },
};
