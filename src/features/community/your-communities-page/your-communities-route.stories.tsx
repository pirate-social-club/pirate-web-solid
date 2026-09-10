import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { AccountCommunityMembership } from "../../../api/account-community-memberships";
import { YourCommunitiesRouteView } from "./your-communities-route";

const routedMembership: AccountCommunityMembership = {
  object: "account_community_membership",
  community_id: "community-harbor",
  display_name: "Harbor",
  resource_href: null,
  canonical_route: {
    family: "spaces",
    root_label: "harbor",
    root_label_display: "harbor",
    path_segment: "harbor",
    href: "/c/harbor",
    app_host: null,
  },
  membership_status: "member",
  can_post: true,
};

const routeLessMembership: AccountCommunityMembership = {
  object: "account_community_membership",
  community_id: "community-open-sea",
  display_name: "Open Sea",
  resource_href: null,
  canonical_route: null,
  membership_status: "member",
  can_post: true,
};

const authenticated = () => ({ status: "authenticated" as const, userId: "account-one" });

const meta = {
  title: "Screens/Community/YourCommunitiesRoute",
  component: YourCommunitiesRouteView,
  args: { navigate: () => undefined },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof YourCommunitiesRouteView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The `/communities` route while the account session is still resolving. */
export const Loading: Story = {
  args: { applicationSession: () => "resolving" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toBeInTheDocument();
  },
};

/** Signed out: the route offers sign-in rather than an empty list. */
export const Anonymous: Story = {
  args: { applicationSession: () => "anonymous" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByRole("heading", { name: "Your Communities", level: 1 })).toBeInTheDocument(),
    );
    await expect(canvas.getByText("Sign in to choose a Community and post.")).toBeInTheDocument();
  },
};

export const Ready: Story = {
  name: "Ready with memberships",
  args: {
    applicationSession: authenticated,
    loadMemberships: async () => [routedMembership, routeLessMembership],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText("Harbor")).toBeInTheDocument());
    await expect(canvas.getByText("Open Sea")).toBeInTheDocument();
  },
};

export const NoMemberships: Story = {
  name: "Ready without memberships",
  args: {
    applicationSession: authenticated,
    loadMemberships: async () => [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText("You aren't an active member of a Community yet.")).toBeInTheDocument(),
    );
  },
};

/** A non-401 load failure keeps the route honest instead of showing an empty list. */
export const LoadFailed: Story = {
  args: {
    applicationSession: authenticated,
    loadMemberships: async () => {
      throw new Error("memberships unavailable");
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByRole("alert")).toHaveTextContent("We couldn't load your Communities. Try again."),
    );
  },
};

export const Mobile: Story = {
  args: {
    applicationSession: authenticated,
    loadMemberships: async () => [routedMembership],
  },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
