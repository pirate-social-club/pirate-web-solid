import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { IconMusicNote } from "@/components/media/icons";
import { demoAvatarImage } from "@/stories/lib/fixtures";
import { StoryRow, StoryStack } from "@/stories/lib/story-layout";
import { Avatar } from "./avatar";

const meta = {
  title: "Components/Data Display/Avatar",
  component: Avatar,
  tags: ["autodocs"],
  args: {
    fallback: "Jane Doe",
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
          "Circular identity image with a dependency-free fallback chain: primary src, one cache-busted retry, fallback src, then initials (from the fallback text), a fallback icon, or a skeleton. `fallback` doubles as the image's accessible label.",
      },
    },
  },
} satisfies Meta<typeof Avatar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const avatar = canvas.getByRole("img", { name: "Jane Doe" });
    await expect(avatar).toBeVisible();
  },
};

export const Variants: Story = {
  render: () => (
    <StoryStack>
      <StoryRow>
        <Avatar fallback="Jane Doe" src={demoAvatarImage} />
        <Avatar fallback="Jane Doe" fallbackSrc={demoAvatarImage} />
        <Avatar
          fallback="Music"
          fallbackIcon={
            <IconMusicNote class="size-5 text-muted-foreground" />
          }
        />
      </StoryRow>
    </StoryStack>
  ),
};

export const Sizes: Story = {
  render: () => (
    <StoryRow class="items-end">
      <Avatar fallback="JD" size="xs" />
      <Avatar fallback="JD" size="sm" />
      <Avatar fallback="JD" size="md" />
      <Avatar fallback="JD" size="lg" />
    </StoryRow>
  ),
};

export const Empty: Story = {
  render: () => (
    <StoryRow class="items-end">
      <Avatar fallback="" size="sm" />
      <Avatar fallback="" size="md" />
      <Avatar fallback="" size="lg" />
    </StoryRow>
  ),
};
