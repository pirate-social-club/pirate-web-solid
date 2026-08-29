import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { PublicProfilePage } from "./public-profile-page";
import type { PublicProfileViewState } from "./public-profile-page.model";

function success(
  overrides: Partial<Extract<PublicProfileViewState, { kind: "success" }>> = {},
): PublicProfileViewState {
  return {
    kind: "success",
    status: 200,
    requestedHandle: "nightshift",
    canonicalHandle: "nightshift",
    canonicalPath: "/u/nightshift",
    isCanonical: true,
    profile: {
      displayName: "Night Shift",
      handle: "nightshift",
      bio: "Late-night sets and long-form mixes.",
    },
    communities: [
      { name: "Night Shift", href: "/c/night-shift" },
      { name: "Deep Cuts", href: "/c/deep-cuts" },
    ],
    ...overrides,
  };
}

const meta = {
  title: "Screens/Profiles/PublicProfilePage",
  component: PublicProfilePage,
  args: { handle: "nightshift", data: success() },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof PublicProfilePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Success",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Night Shift" })).toBeInTheDocument();
  },
};

export const NoCommunities: Story = {
  name: "No communities",
  args: { data: success({ communities: [] }) },
};

export const NoBio: Story = {
  name: "No bio or display name",
  args: {
    data: success({ profile: { displayName: null, handle: "nightshift", bio: null } }),
  },
};

/**
 * A non-canonical handle still renders, so the page must point at the
 * canonical path rather than silently presenting the alias as canonical.
 */
export const NonCanonicalHandle: Story = {
  name: "Non-canonical handle",
  args: {
    handle: "NightShift",
    data: success({ requestedHandle: "NightShift", isCanonical: false }),
  },
};

export const NotFound: Story = {
  name: "Not found",
  args: { data: { kind: "not-found", status: 404 } },
};

export const Invalid: Story = {
  name: "Invalid handle",
  args: { handle: "not a handle", data: { kind: "invalid", status: 400 } },
};

export const Unavailable: Story = {
  name: "Unavailable",
  args: { data: { kind: "unavailable", status: 502 } },
};

export const Mobile: Story = {
  name: "Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
