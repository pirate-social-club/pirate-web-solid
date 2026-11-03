import { createSignal, onCleanup } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { SESSION_FENCED_EVENT, SessionAuthorityChangedError } from "../../../api/browser-session-events.ts";
import { ApplicationSessionProvider, type ApplicationSessionState } from "../../shell/application-session.tsx";
import type { CommunityEngagementApi, CommunityViewerEngagement } from "./community-engagement-api.ts";
import type { CommunityPageSuccess } from "./community-page.model.ts";
import { CommunityPage } from "./community-page.tsx";

const data: CommunityPageSuccess = {
  kind: "success", status: 200, requestedPathSegment: "session-refresh",
  canonicalPath: "/c/session-refresh", canonicalUrl: "https://pirate.sc/c/session-refresh",
  communityId: "community_2f1c9a10-1b2c-4d3e-8f90-abcdef012345",
  routeFamily: "hns", routeDisplay: "session-refresh",
  community: {
    displayName: "Session refresh", description: "A community ready after sign-in.",
    membershipMode: "open", memberCount: 12, followerCount: 20, rules: [],
  },
};

function SessionRefreshFixture() {
  const account = { status: "authenticated" as const, userId: "storybook-account" };
  const [session, setSession] = createSignal<ApplicationSessionState>(account);
  let rejectRead!: (error: Error) => void;
  let finishRead!: (viewer: CommunityViewerEngagement) => void;
  const cancelled = new Promise<never>((_, reject) => { rejectRead = reject; });
  const fresh = new Promise<CommunityViewerEngagement>(resolve => { finishRead = resolve; });
  let refreshing = false;
  const api: CommunityEngagementApi = {
    readViewerState: () => refreshing ? fresh : cancelled,
    resolveJoinAction: async () => ({ kind: "joined" }),
    join: async () => { throw new Error("This read-only story cannot join"); },
    follow: async () => { throw new Error("This read-only story cannot follow"); },
    unfollow: async () => { throw new Error("This read-only story cannot unfollow"); },
  };
  const bindControls = (element: HTMLDivElement) => {
    const cancel = () => {
      window.dispatchEvent(new Event(SESSION_FENCED_EVENT));
      rejectRead(new SessionAuthorityChangedError());
    };
    const refresh = () => { refreshing = true; setSession({ ...account }); };
    const finish = () => finishRead({ membership: "member", following: true, followerCount: 20 });
    element.addEventListener("storybook:cancel-viewer-read", cancel);
    element.addEventListener("storybook:refresh-viewer-session", refresh);
    element.addEventListener("storybook:finish-viewer-read", finish);
    onCleanup(() => {
      element.removeEventListener("storybook:cancel-viewer-read", cancel);
      element.removeEventListener("storybook:refresh-viewer-session", refresh);
      element.removeEventListener("storybook:finish-viewer-read", finish);
    });
  };
  return (
    <div ref={bindControls} data-session-refresh-story>
      <ApplicationSessionProvider state={session}>
        <CommunityPage
          pathSegment="session-refresh" data={data} engagementApi={api}
          resolveSession={async () => ({ ...account, personas: [] })}
          resolveOwnerSettingsAccess={async () => false}
          loadThreads={async () => ({ posts: [], nextCursor: null })}
          handleSalesClient={{ get_communitiesCommunityIdHandleOfferings: async () => ({ items: [], next_cursor: null }) }}
        />
      </ApplicationSessionProvider>
    </div>
  );
}

const meta = {
  title: "Screens/Community/CommunityPage/Session refresh",
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  render: () => <SessionRefreshFixture />,
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const CancelledLoginRead: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const wrapper = canvasElement.querySelector("[data-session-refresh-story]")!;
    const membership = () => canvasElement.querySelector("[data-community-membership-slot]");
    await waitFor(() => expect(membership()).toHaveAttribute("aria-busy", "true"));
    wrapper.dispatchEvent(new Event("storybook:cancel-viewer-read"));
    await new Promise(resolve => setTimeout(resolve, 0));
    await expect(membership()).toHaveAttribute("aria-busy", "true");
    await expect(canvas.queryByRole("button", { name: "Check your membership again" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Post" })).not.toBeInTheDocument();
    wrapper.dispatchEvent(new Event("storybook:refresh-viewer-session"));
    await expect(membership()).toHaveAttribute("aria-busy", "true");
    wrapper.dispatchEvent(new Event("storybook:finish-viewer-read"));
    await expect(await canvas.findByRole("button", { name: "Post" })).toBeEnabled();
    await expect(canvas.queryByRole("button", { name: "Check your membership again" })).not.toBeInTheDocument();
  },
};

export const PhoneCancelledLoginRead: Story = {
  ...CancelledLoginRead,
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
