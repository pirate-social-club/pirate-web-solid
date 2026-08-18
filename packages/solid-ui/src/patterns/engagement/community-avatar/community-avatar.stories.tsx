import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { demoAvatarImage } from "@/stories/lib/fixtures";
import { StoryRow } from "@/stories/lib/story-layout";
import { CommunityAvatar } from "./community-avatar";

const meta = {
  title: "Patterns/Engagement/CommunityAvatar",
  component: CommunityAvatar,
  tags: ["autodocs"],
  args: {
    communityId: "cmt_atlas",
    displayName: "Atlas Gardens",
    size: "md",
  },
  argTypes: {
    size: {
      control: "select",
      options: ["xs", "sm", "md", "lg"],
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Community identity avatar. Resolves an explicit `avatarSrc`, or generates a deterministic initials SVG from `communityId` and `displayName` — same input, same image, no network or asset dependency.",
      },
    },
  },
} satisfies Meta<typeof CommunityAvatar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const avatar = canvas.getByRole("img", { name: "Atlas Gardens" });
    await expect(avatar).toBeVisible();
  },
};

export const Sizes: Story = {
  render: () => (
    <StoryRow class="items-end">
      <CommunityAvatar
        communityId="cmt_tide"
        displayName="Tide Room"
        size="xs"
      />
      <CommunityAvatar
        communityId="cmt_atlas"
        displayName="Atlas Gardens"
        size="sm"
      />
      <CommunityAvatar
        communityId="cmt_signal"
        displayName="Signal Room"
        size="md"
      />
      <CommunityAvatar
        communityId="cmt_foundry"
        displayName="Foundry Operators"
        size="lg"
      />
    </StoryRow>
  ),
};

export const Variants: Story = {
  render: () => (
    <StoryRow class="items-end">
      <CommunityAvatar
        avatarSrc={demoAvatarImage}
        communityId="cmt_atlas"
        displayName="Atlas Gardens"
        size="md"
      />
      <CommunityAvatar
        communityId="cmt_atlas"
        displayName="Atlas Gardens"
        size="md"
      />
    </StoryRow>
  ),
};
