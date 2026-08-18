import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Button } from "@/components/actions/button/button";
import { EmptyFeedState } from "@/patterns/feedback/route-states/route-states";
import { StatusCard } from "@/patterns/feedback/status-card/status-card";

import { StackPageShell } from "./stack-page-shell";

const meta = {
  title: "Patterns/Layout/StackPageShell",
  component: StackPageShell,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Stacked page scaffold with a card or plain header (title, description, actions) above page content.",
      },
    },
  },
  args: {
    title: "Settings",
  },
} satisfies Meta<typeof StackPageShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const CardHeader: Story = {
  render: () => (
    <StackPageShell
      title="Settings"
      description="Manage your account preferences."
      actions={<Button variant="secondary">Save</Button>}
    >
      <StatusCard
        title="Content"
        description="This is the child content inside a card-header shell."
      />
    </StackPageShell>
  ),
};

export const PlainHeader: Story = {
  render: () => (
    <StackPageShell
      title="Moderation log"
      headerVariant="plain"
      hideTitleOnMobile
      actions={<Button variant="secondary">Export</Button>}
    >
      <EmptyFeedState message="No moderation actions yet." />
    </StackPageShell>
  ),
};
