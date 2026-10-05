/** @jsxImportSource @solidjs/web */
import { createEffect } from "solid-js";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { ActivePersonaProvider, useActivePersonaStore } from "../../identity/active-persona-store.tsx";
import { ShellStory, communityAppScope, communityModeratorScope, creatorNavigation, manyJoinedNavigation, popularNavigation, memberNavigation, personas, reviewViewports } from "./media-shell-story-fixtures.tsx";

const meta = {
  title: "Screens/Shell/MediaShell",
  globals: { viewport: { value: "desktopReview", isRotated: false } },
  parameters: {
    layout: "fullscreen",
    viewport: { options: reviewViewports },
    a11y: { test: "error" },
    docs: { description: { component: "The production chrome driven by the real route policy: tabs, the drawer and the sidebar navigate inside the story, so the active tab and page change as they do in the app. Page bodies are placeholders." } },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: "mobile1", isRotated: false } };

export const AnonymousDesktop: Story = { render: () => <ShellStory signedIn={false} communityNavigation={{ kind: "ready", data: popularNavigation }} /> };
export const AuthenticatedDesktop: Story = { render: () => <ShellStory /> };
export const ResolvingAccount: Story = { render: () => <ShellStory signedIn={false} personas={[]} sessionResolving communityNavigation={{ kind: "loading" }} /> };
export const Mobile: Story = { globals: phone, render: () => <ShellStory /> };
export const MobilePostingEntry: Story = {
  globals: phone,
  render: () => <ShellStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Choose a community to post in" }, { timeout: 10000 }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Destination: /communities");
  },
};
export const CommunityDetailMobile: Story = { globals: phone, render: () => <ShellStory initialPath="/c/harbor" /> };
export const MobileDrawer: Story = { globals: phone, render: () => <ShellStory initialMenuOpen /> };
export const DesktopPersonaPicker: Story = { render: () => <ShellStory pickerOpen /> };
export const MobilePersonaPicker: Story = { globals: phone, render: () => <ShellStory pickerOpen /> };

export const MobileTabs: Story = {
  globals: phone,
  render: () => <ShellStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tabs = within(await canvas.findByRole("navigation", { name: "Primary navigation" }));
    await userEvent.click(tabs.getByRole("button", { name: "Your Songs" }));
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Destination: /songs"));
    await expect(tabs.getByRole("button", { name: "Your Songs" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(tabs.getByRole("button", { name: "Wallet" }));
    await waitFor(() => expect(tabs.getByRole("button", { name: "Wallet" })).toHaveAttribute("aria-current", "page"));
  },
};

export const MobileDrawerCommunities: Story = {
  globals: phone,
  render: () => <ShellStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Open navigation" }));
    const drawer = await page.findByRole("dialog", { name: "Navigation" });
    await expect(await within(drawer).findByRole("link", { name: "Night Shift Radio" })).toBeInTheDocument();
    await expect(within(drawer).queryByText("Night Shift")).not.toBeInTheDocument();
    await expect(within(drawer).queryByText("Studio")).not.toBeInTheDocument();
    await expect(within(drawer).queryByRole("link", { name: "Wallet" })).not.toBeInTheDocument();
    await userEvent.click(await within(drawer).findByRole("link", { name: "Harbor Collective" }));
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Destination: /c/harbor"));
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};

export const ProfileTabOpensProfile: Story = {
  globals: phone,
  render: () => <ShellStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tabs = within(await canvas.findByRole("navigation", { name: "Primary navigation" }));
    await userEvent.click(tabs.getByRole("button", { name: "Profile, Harbor" }));
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Destination: /u/harbor.pirate"));
  },
};

/** Two profiles: a double tap toggles between them without opening anything. */
export const DoubleTapTogglesTwoProfiles: Story = {
  globals: phone,
  render: () => <ShellStory personas={personas.slice(0, 2)} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tabs = within(await canvas.findByRole("navigation", { name: "Primary navigation" }));
    await userEvent.dblClick(tabs.getByRole("button", { name: "Profile, Harbor" }));
    await waitFor(() => expect(tabs.getByRole("button", { name: "Profile, Night Shift" })).toBeInTheDocument());
    await expect(within(canvasElement.ownerDocument.body).queryByRole("dialog")).not.toBeInTheDocument();
  },
};

/** Three or more profiles: a double tap opens the profile sheet. */
export const DoubleTapOpensProfileSheet: Story = {
  globals: phone,
  render: () => <ShellStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tabs = within(await canvas.findByRole("navigation", { name: "Primary navigation" }));
    await userEvent.dblClick(tabs.getByRole("button", { name: "Profile, Harbor" }));
    const sheet = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Your profiles" });
    await expect(within(sheet).queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
    await expect(within(sheet).queryByRole("button", { name: "View profile" })).not.toBeInTheDocument();
  },
};

/** Registers a community target the way a community page does. */
function CommunityTarget(props: { readonly personaIds: readonly string[] }) {
  const store = useActivePersonaStore();
  createEffect(() => true, () => store.setTarget({
    communityId: "community_harbor",
    personas: personas.filter(persona => props.personaIds.includes(persona.personaId)),
    title: "Profile in this community",
  }));
  return null;
}

/**
 * On a community page with one eligible profile the community owns the
 * gesture: a double tap does nothing, even though the account has three
 * profiles, and a single tap opens the profile page at once.
 */
export const CommunityPageOneEligibleProfile: Story = {
  globals: phone,
  render: () => <ActivePersonaProvider><CommunityTarget personaIds={["persona_harbor"]} /><ShellStory initialPath="/c/harbor" /></ActivePersonaProvider>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tabs = within(await canvas.findByRole("navigation", { name: "Primary navigation" }));
    await userEvent.dblClick(tabs.getByRole("button", { name: "Profile, Harbor" }));
    await expect(within(canvasElement.ownerDocument.body).queryByRole("dialog")).not.toBeInTheDocument();
    await expect(tabs.getByRole("button", { name: "Profile, Harbor" })).toBeInTheDocument();
  },
};

export const CreatorDesktop: Story = { render: () => <ShellStory communityNavigation={{ kind: "ready", data: creatorNavigation }} /> };
export const AnonymousDrawer: Story = { globals: phone, render: () => <ShellStory signedIn={false} initialMenuOpen communityNavigation={{ kind: "ready", data: popularNavigation }} /> };
export const CreatorDrawer: Story = { globals: phone, render: () => <ShellStory initialMenuOpen communityNavigation={{ kind: "ready", data: creatorNavigation }} /> };
export const CommunitiesLoading: Story = { render: () => <ShellStory communityNavigation={{ kind: "loading" }} /> };
export const CommunitiesError: Story = {
  render: () => {
    let firstRequest = true;
    return <ShellStory communityNavigation={undefined} loadCommunityNavigation={async () => {
      if (firstRequest) { firstRequest = false; throw new Error("fixture_discovery_unavailable"); }
      return memberNavigation;
    }} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("alert")).toHaveTextContent("Communities couldn’t be loaded.");
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(await canvas.findByRole("link", { name: "Harbor Collective" })).toBeInTheDocument();
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
};
export const ManyJoinedCommunities: Story = { render: () => <ShellStory communityNavigation={{ kind: "ready", data: manyJoinedNavigation }} /> };
export const EmptyCommunities: Story = { render: () => <ShellStory communityNavigation={{ kind: "ready", data: { joined: [], popular: [], moderated: [] } }} /> };
export const DesktopNavigation: Story = {
  render: () => <ShellStory communityNavigation={{ kind: "ready", data: { ...manyJoinedNavigation, moderated: creatorNavigation.moderated } }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const navigation = within(canvas.getByRole("navigation", { name: "Main navigation" }));
    await expect(navigation.queryByRole("link", { name: "Post" })).not.toBeInTheDocument();
    await expect(navigation.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    await expect(navigation.queryByText("Resources")).not.toBeInTheDocument();
    await userEvent.click(navigation.getByRole("link", { name: "Your Songs" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Destination: /songs");
    await expect(navigation.getByRole("link", { name: "Your Songs" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(navigation.getByRole("link", { name: "Harbor Collective" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Destination: /c/harbor");
    await expect(navigation.getByRole("link", { name: "Harbor Collective" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(navigation.getByRole("link", { name: "See all" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Destination: /communities");
    await userEvent.click(navigation.getByRole("button", { name: "Create community" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("Destination: /communities/new");
  },
};

export const AnonymousDrawerNavigation: Story = {
  globals: phone,
  render: () => <ShellStory signedIn={false} communityNavigation={{ kind: "ready", data: popularNavigation }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Open navigation" }));
    const drawer = within(await page.findByRole("dialog", { name: "Navigation" }));
    await expect(drawer.getByRole("link", { name: "World of Sound" })).toBeInTheDocument();
    await expect(drawer.queryByRole("heading", { name: "MODERATOR" })).not.toBeInTheDocument();
    await expect(drawer.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
    await expect(drawer.queryByRole("link", { name: "Terms" })).not.toBeInTheDocument();
    await expect(drawer.queryByRole("link", { name: "Privacy" })).not.toBeInTheDocument();
    await userEvent.click(drawer.getByRole("link", { name: "World of Sound" }));
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Destination: /c/world-of-sound"));
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
  },
};

async function checkCommunityScope(navigation: ReturnType<typeof within>, moderator: boolean) {
  await expect(navigation.queryByRole("link", { name: "Explore" })).not.toBeInTheDocument();
  await expect(navigation.queryByRole("button", { name: "Create community" })).not.toBeInTheDocument();
  await expect(navigation.queryByRole("link", { name: "World of Sound" })).not.toBeInTheDocument();
  await expect(navigation.queryByRole("link", { name: "Night Shift Radio" })).not.toBeInTheDocument();
  await expect(navigation.queryByRole("link", { name: "Terms" })).not.toBeInTheDocument();
  await expect(navigation.queryByRole("link", { name: "Privacy" })).not.toBeInTheDocument();
  await expect(navigation.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/c/harbor");
  if (moderator) {
    await expect(navigation.getByRole("link", { name: "Moderation" })).toHaveAttribute("href", "/c/harbor/settings/moderation_queue");
  } else {
    await expect(navigation.queryByRole("link", { name: "Moderation" })).not.toBeInTheDocument();
  }
}
export const CommunityAppDesktop: Story = {
  render: () => <ShellStory navigationScope={communityAppScope} communityNavigation={{ kind: "ready", data: creatorNavigation }} />,
  play: async ({ canvasElement }) => checkCommunityScope(within(within(canvasElement).getByRole("navigation", { name: "Main navigation" })), false),
};
export const CommunityAppModeratorDesktop: Story = {
  render: () => <ShellStory navigationScope={communityModeratorScope} communityNavigation={{ kind: "ready", data: creatorNavigation }} />,
  play: async ({ canvasElement }) => checkCommunityScope(within(within(canvasElement).getByRole("navigation", { name: "Main navigation" })), true),
};
export const CommunityAppAnonymousDesktop: Story = {
  render: () => <ShellStory signedIn={false} navigationScope={communityModeratorScope} communityNavigation={{ kind: "ready", data: creatorNavigation }} />,
  play: async ({ canvasElement }) => checkCommunityScope(within(within(canvasElement).getByRole("navigation", { name: "Main navigation" })), false),
};
export const CommunityAppDrawer: Story = {
  globals: phone,
  render: () => <ShellStory navigationScope={communityAppScope} communityNavigation={{ kind: "ready", data: creatorNavigation }} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: "Open navigation" }, { timeout: 10000 }));
    await checkCommunityScope(within(await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Navigation" })), false);
  },
};
export const CommunityAppModeratorDrawer: Story = {
  globals: phone,
  render: () => <ShellStory navigationScope={communityModeratorScope} communityNavigation={{ kind: "ready", data: creatorNavigation }} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: "Open navigation" }, { timeout: 10000 }));
    await checkCommunityScope(within(await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Navigation" })), true);
  },
};

export const AnonymousProductionDefaults: Story = {
  render: () => <ShellStory signedIn={false} communityNavigation={undefined} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Create community" })).not.toBeInTheDocument());
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
};
