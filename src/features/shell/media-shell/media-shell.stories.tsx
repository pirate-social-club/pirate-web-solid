/** @jsxImportSource @solidjs/web */
import { createSignal } from "solid-js";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { switcherPersonas } from "../../identity/persona-switcher-sheet/persona-switcher-fixtures.ts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Card, CardContent, Type } from "../../../design-system";
import { MediaShell, type MediaShellProps } from "./media-shell";

const meta = { title: "Screens/Shell/MediaShell", parameters: { layout: "fullscreen", a11y: { test: "error" } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function FeedPreview() {
  return (
    <main data-feed-preview class="mx-auto flex min-h-[70vh] max-w-2xl flex-col gap-4">
      <div>
        <Type as="p" variant="label" class="text-muted-foreground">For you</Type>
        <Type as="h1" variant="h1">Public feed</Type>
      </div>
      {["A harbor morning", "How we build together", "Late-night karaoke"].map((title, index) => (
        <Card>
          <CardContent class="flex min-h-48 flex-col justify-end gap-2 p-5">
            <Type as="p" variant="caption">c/pirate · {index + 1}h</Type>
            <Type as="h2" variant="h3">{title}</Type>
            <Type variant="body" class="text-muted-foreground">A small content card ready to become a richer media post.</Type>
          </CardContent>
        </Card>
      ))}
    </main>
  );
}

function ShellStory(props: Partial<MediaShellProps>) {
  const [selected, setSelected] = createSignal(switcherPersonas[0]!.personaId);
  const [path, setPath] = createSignal("/");
  return <MediaShell signedIn personas={switcherPersonas} selectedPersonaId={selected()} onPersonaSelect={setSelected} navigate={setPath} {...props}><Type class="sr-only" role="status">Destination: {path()}</Type><FeedPreview /></MediaShell>;
}
export const AnonymousDesktop: Story = { render: () => <ShellStory signedIn={false} /> };
export const AuthenticatedDesktop: Story = { render: () => <ShellStory /> };
export const ResolvingAccount: Story = { render: () => <ShellStory signedIn={false} personas={[]} sessionResolving /> };
export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } }, render: () => <ShellStory /> };
export const MobileDrawer: Story = { globals: { viewport: { value: "mobile1", isRotated: false } }, render: () => <ShellStory initialMenuOpen /> };
export const DesktopPersonaPicker: Story = { render: () => <ShellStory pickerOpen /> };
export const MobilePersonaPicker: Story = { globals: { viewport: { value: "mobile1", isRotated: false } }, render: () => <ShellStory pickerOpen /> };
export const MobileNavigation: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } }, render: () => <ShellStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Open navigation" }));
    const drawer = await page.findByRole("dialog", { name: "Navigation" });
    await userEvent.click(within(drawer).getByRole("link", { name: "Wallet" }));
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Destination: /wallet"));
    await expect(page.queryByRole("dialog")).not.toBeInTheDocument();
  },
};

export const ProfileSettingsNavigation: Story = {
  render: () => <ShellStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: /Switch profile, currently/ }));
    const picker = await page.findByRole("dialog", { name: "Your profiles" });
    await userEvent.click(within(picker).getByRole("button", { name: /^Settings$/ }));
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Destination: /settings"));
    await expect(page.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(canvasElement.ownerDocument.body).not.toHaveStyle({ pointerEvents: "none" });
  },
};
export const MobileProfileSettingsNavigation: Story = {
  ...ProfileSettingsNavigation,
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
