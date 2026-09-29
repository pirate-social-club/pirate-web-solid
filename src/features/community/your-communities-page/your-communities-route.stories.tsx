import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import type { AccountCommunityMembership } from "../../../api/account-community-memberships.ts";
import { YourCommunitiesRouteView } from "./your-communities-route.tsx";

/** The destination step after "Use this song": the real route with injected
 * data, so each story is the step a person sees for that state. The song is
 * carried in the address; the step names it and asks where to post. */

function member(id: string, name: string, slug?: string): AccountCommunityMembership {
  return {
    object: "account_community_membership",
    community_id: id,
    display_name: name,
    resource_href: slug ? `/c/${slug}` : null,
    canonical_route: slug
      ? { family: "spaces", root_label: slug, root_label_display: slug, path_segment: slug, href: `/c/${slug}`, app_host: null }
      : null,
    membership_status: "member",
    can_post: true,
  };
}

const communities = [
  member("cmt_harbor", "Harbor", "harbor"),
  member("cmt_signal", "Signal Room", "signal-room"),
  member("cmt_open_sea", "Open Sea"),
];

const signedIn = () => ({ status: "authenticated" as const, userId: "story-account" });

const meta = {
  title: "Flows/Posts/VideoPost/Destination",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Where a video for a chosen song is posted. The heading names the song, each action names its community, and nothing on the page leads away from the song.",
      },
    },
  },
  globals: { viewport: { value: "mobile1", isRotated: false } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const NamedSong: Story = {
  name: "Song named, one action per community",
  render: () => (
    <YourCommunitiesRouteView
      applicationSession={signedIn}
      initialVideoSong={{ postId: "cadence" }}
      loadMemberships={async () => communities}
      navigate={() => undefined}
      readSongTitle={async () => "Cadence"}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { level: 1, name: "Post a video with “Cadence”" });
    await canvas.findByText("Choose a community to post it in.");
    const actions = await canvas.findAllByRole("button", { name: /^Post video in / });
    expect(actions.map(action => action.getAttribute("aria-label"))).toEqual([
      "Post video in Harbor",
      "Post video in Signal Room",
      "Post video in Open Sea",
    ]);
    // Nothing else is offered: a link to a community, or to create one, would
    // leave the step and lose the song.
    expect(canvas.queryByRole("button", { name: "Create community" })).toBeNull();
    expect(canvasElement.querySelectorAll("button:not([data-post-community-id])")).toHaveLength(0);
  },
};

export const SongTitleUnavailable: Story = {
  name: "Song title could not be read",
  render: () => (
    <YourCommunitiesRouteView
      applicationSession={signedIn}
      initialVideoSong={{ postId: "cadence" }}
      loadMemberships={async () => communities}
      navigate={() => undefined}
      readSongTitle={async () => null}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findAllByRole("button", { name: /^Post video in / });
    await canvas.findByRole("heading", { level: 1, name: "Post a video with this song" });
  },
};

export const WorkingOnATap: Story = {
  name: "Tapped action working",
  render: () => (
    <YourCommunitiesRouteView
      applicationSession={signedIn}
      initialVideoSong={{ postId: "cadence" }}
      loadMemberships={async () => communities}
      navigate={() => undefined}
      readSongTitle={async () => "Cadence"}
      resolvePostingSession={() => new Promise(() => {})}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const harbor = await canvas.findByRole("button", { name: "Post video in Harbor" });
    await userEvent.click(harbor);
    await waitFor(() => expect(harbor).toHaveAttribute("aria-busy", "true"));
    expect(canvas.getByRole("button", { name: "Post video in Signal Room" })).toBeDisabled();
    expect(canvas.getByRole("button", { name: "Post video in Open Sea" })).toBeDisabled();
  },
};

export const NoPostableCommunity: Story = {
  name: "No community to post in",
  render: () => (
    <YourCommunitiesRouteView
      applicationSession={signedIn}
      initialVideoSong={{ postId: "cadence" }}
      loadMemberships={async () => []}
      navigate={() => undefined}
      readSongTitle={async () => "Cadence"}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("You don't have a community where you can post this video yet.");
    // With nowhere to post, creating a community is the way forward.
    await canvas.findByRole("button", { name: "Create community" });
    expect(canvas.queryByRole("button", { name: /^Post video in / })).toBeNull();
    expect(canvas.queryByText("Choose a community to post it in.")).toBeNull();
  },
};

export const SignedOut: Story = {
  name: "Signed out",
  render: () => (
    <YourCommunitiesRouteView
      applicationSession={() => "anonymous"}
      initialVideoSong={{ postId: "cadence" }}
      navigate={() => undefined}
      readSongTitle={async () => "Cadence"}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Sign in to choose where to post your video.");
    await canvas.findByRole("button", { name: "Sign in" });
  },
};
