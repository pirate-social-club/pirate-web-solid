import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { CommunityNamespaceSettingsPanel } from "./community-namespace-settings-panel";

const meta = {
  title: "Screens/Community/OwnerSettings/Namespace",
  component: CommunityNamespaceSettingsPanel,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  decorators: [(Story) => <main class="mx-auto max-w-5xl p-4 md:p-8"><Story /></main>],
} satisfies Meta<typeof CommunityNamespaceSettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConnectedName: Story = {
  args: {
    connectedName: {
      address: "https://midnight/",
      label: "midnight/",
      providerLabel: "Connected with Handshake",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "midnight/" })).toBeInTheDocument();
    await expect(canvas.getByText("Connected")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Open name" })).toHaveAttribute("href", "https://midnight/");
  },
};
