import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { IconPause, IconPlay, IconX } from "@/components/media/icons";
import { StoryRow } from "@/stories/lib/story-layout";
import { MediaControlButton } from "./media-control-button";

const meta = {
  title: "Components/Media/MediaControlButton",
  component: MediaControlButton,
  tags: ["autodocs"],
  args: {
    intent: "default",
    size: "md",
    disabled: false,
  },
  argTypes: {
    intent: {
      control: "select",
      options: ["default", "subtle", "muted", "danger"],
    },
    size: { control: "select", options: ["sm", "md", "lg"] },
    disabled: { control: "boolean" },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Circular media-transport button with four intents (default, subtle, muted, danger) and three sizes. Content is children: pass an icon and always provide an accessible name via `aria-label` or visible text.",
      },
    },
  },
} satisfies Meta<typeof MediaControlButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <MediaControlButton aria-label="Play">
      <IconPlay class="size-5" />
    </MediaControlButton>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const play = canvas.getByRole("button", { name: "Play" });
    await userEvent.click(play);
    await expect(play).toHaveFocus();
  },
};

export const Variants: Story = {
  render: () => (
    <StoryRow class="bg-background p-6">
      <MediaControlButton aria-label="Play">
        <IconPlay class="size-5" />
      </MediaControlButton>
      <MediaControlButton aria-label="Pause">
        <IconPause class="size-5" />
      </MediaControlButton>
      <MediaControlButton intent="subtle" aria-label="Subtle play">
        <IconPlay class="size-5" />
      </MediaControlButton>
      <MediaControlButton intent="muted" aria-label="Muted play">
        <IconPlay class="size-5" />
      </MediaControlButton>
      <MediaControlButton intent="danger" aria-label="Remove">
        <IconX class="size-4" />
      </MediaControlButton>
    </StoryRow>
  ),
};

export const Sizes: Story = {
  render: () => (
    <StoryRow>
      <MediaControlButton size="sm" aria-label="Small play">
        <IconPlay class="size-4" />
      </MediaControlButton>
      <MediaControlButton size="md" aria-label="Medium play">
        <IconPlay class="size-5" />
      </MediaControlButton>
      <MediaControlButton size="lg" aria-label="Large play">
        <IconPlay class="size-5" />
      </MediaControlButton>
    </StoryRow>
  ),
};

export const Disabled: Story = {
  render: () => (
    <MediaControlButton disabled aria-label="Pause">
      <IconPause class="size-5" />
    </MediaControlButton>
  ),
};
