/** @jsxImportSource @solidjs/web */
import { createEffect, createMemo, createSignal, omit } from "solid-js";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { switcherPersonas } from "../../identity/persona-switcher-sheet/persona-switcher-fixtures.ts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Type } from "../../../design-system";
import { ActivePersonaProvider, useActivePersonaStore } from "../../identity/active-persona-store.tsx";
import type { SwitchablePersona } from "../../identity/persona-switcher-sheet/persona-switcher-sheet.tsx";
import { resolveApplicationChrome } from "../application-chrome-model.ts";
import type { DrawerCommunity } from "../navigation-drawer.tsx";
import { MediaShell, type MediaShellProps } from "./media-shell";

const meta = {
  title: "Screens/Shell/MediaShell",
  parameters: {
    layout: "fullscreen",
    a11y: { test: "error" },
    docs: { description: { component: "The production chrome driven by the real route policy: tabs, the drawer and the sidebar navigate inside the story, so the active tab and page change as they do in the app. Page bodies are placeholders." } },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const communities: readonly DrawerCommunity[] = [
  { communityId: "community_harbor", displayName: "Harbor Collective", href: "/c/harbor" },
  { communityId: "community_night", displayName: "Night Shift Radio", href: "/c/night-shift" },
];

// One profile is bound to a community; the drawer lists that community once.
const personas: readonly SwitchablePersona[] = switcherPersonas.map(persona =>
  persona.personaId === "persona_night" ? { ...persona, communityId: "community_night" } : persona);

/** Stands in for the full-bleed home video so the transparent header reads as it does in the app. */
function VideoFeedPreview() {
  return (
    <main data-feed-preview class="grid h-full min-h-[100dvh] place-items-center bg-gradient-to-b from-slate-700 via-slate-900 to-black">
      <Type class="text-white/70">Video feed</Type>
    </main>
  );
}

function PagePreview(props: { title: string; path: string }) {
  return (
    <main class="mx-auto flex max-w-2xl flex-col gap-2 px-4 py-8">
      <Type as="h1" variant="h1">{props.title || "Page"}</Type>
      <Type class="text-muted-foreground">Placeholder for {props.path}</Type>
    </main>
  );
}

function ShellStory(props: Partial<MediaShellProps> & { readonly initialPath?: string }) {
  const shellProps = omit(props, "initialPath");
  const profiles = () => props.personas ?? personas;
  const [selected, setSelected] = createSignal(profiles()[0]?.personaId);
  const [path, setPath] = createSignal(props.initialPath ?? "/");
  const policy = createMemo(() => resolveApplicationChrome(path()));
  return (
    <MediaShell
      signedIn
      personas={profiles()}
      selectedPersonaId={selected()}
      onPersonaSelect={setSelected}
      loadCommunities={async () => communities}
      navigate={setPath}
      activeItemId={policy().activeItemId}
      mobileActiveItem={policy().mobileActiveItem}
      mobileTitle={policy().mobileTitle}
      mode={policy().mode}
      {...shellProps}
    >
      <Type class="sr-only" role="status">Destination: {path()}</Type>
      {path() === "/" ? <VideoFeedPreview /> : <PagePreview path={path()} title={policy().mobileTitle} />}
    </MediaShell>
  );
}

const phone = { viewport: { value: "mobile1", isRotated: false } };

export const AnonymousDesktop: Story = { render: () => <ShellStory signedIn={false} /> };
export const AuthenticatedDesktop: Story = { render: () => <ShellStory /> };
export const ResolvingAccount: Story = { render: () => <ShellStory signedIn={false} personas={[]} sessionResolving /> };
export const Mobile: Story = { globals: phone, render: () => <ShellStory /> };
export const MobileDrawer: Story = { globals: phone, render: () => <ShellStory initialMenuOpen /> };
export const DesktopPersonaPicker: Story = { render: () => <ShellStory pickerOpen /> };
export const MobilePersonaPicker: Story = { globals: phone, render: () => <ShellStory pickerOpen /> };

export const MobileTabs: Story = {
  globals: phone,
  render: () => <ShellStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tabs = within(await canvas.findByRole("navigation", { name: "Primary navigation" }));
    await userEvent.click(tabs.getByRole("button", { name: "Your songs" }));
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Destination: /songs"));
    await expect(tabs.getByRole("button", { name: "Your songs" })).toHaveAttribute("aria-current", "page");
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
    await userEvent.click(await canvas.findByRole("button", { name: "Open communities and settings" }));
    const drawer = await page.findByRole("dialog", { name: "Communities and settings" });
    await expect(await within(drawer).findByRole("button", { name: "Night Shift Radio" })).toBeInTheDocument();
    await expect(within(drawer).queryByText("Night Shift")).not.toBeInTheDocument();
    await expect(within(drawer).queryByText("Studio")).not.toBeInTheDocument();
    await expect(within(drawer).queryByRole("link", { name: "Wallet" })).not.toBeInTheDocument();
    await userEvent.click(await within(drawer).findByRole("button", { name: "Harbor Collective" }));
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
