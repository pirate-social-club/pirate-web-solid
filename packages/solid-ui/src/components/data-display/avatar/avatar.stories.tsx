import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { IconMusicNote } from "@/components/media/icons";
import { demoAvatarImage } from "@/stories/lib/fixtures";
import { StoryRow, StoryStack } from "@/stories/lib/story-layout";
import { Avatar } from "./avatar";

const meta = {
  title: "Components/Data Display/Avatar",
  component: Avatar,
  tags: ["autodocs"],
  args: {
    fallback: "journey demonstrator",
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
    const avatar = canvas.getByRole("img", { name: "journey demonstrator" });
    await expect(avatar).toBeVisible();
  },
};

export const Variants: Story = {
  render: () => (
    <StoryStack>
      <StoryRow>
        <Avatar fallback="journey demonstrator" src={demoAvatarImage} />
        <Avatar fallback="journey demonstrator" fallbackSrc={demoAvatarImage} />
        <Avatar
          fallback="Music"
          fallbackIcon={
            <IconMusicNote class="size-5 text-muted-foreground" />
          }
        />
      </StoryRow>
    </StoryStack>
  ),
  play: async ({ canvasElement }) => {
    // Both image avatars show the mascot: the fixture is a served asset, so
    // neither falls through to initials.
    const images = [...canvasElement.querySelectorAll("img")];
    await expect(images).toHaveLength(2);
    await waitFor(() => {
      for (const image of images) {
        expect(image.complete && image.naturalWidth > 0).toBe(true);
      }
    });
  },
};

export const Sizes: Story = {
  render: () => (
    <StoryRow class="items-end">
      <Avatar fallback="journey demonstrator" size="xs" />
      <Avatar fallback="journey demonstrator" size="sm" />
      <Avatar fallback="journey demonstrator" size="md" />
      <Avatar fallback="journey demonstrator" size="lg" />
    </StoryRow>
  ),
  play: async ({ canvasElement }) => {
    // Paper shows the two-letter initials "JD" at every size (24/36/48/56).
    const avatars = within(canvasElement).getAllByRole("img", { name: "journey demonstrator" });
    await expect(avatars.map((avatar) => avatar.textContent)).toEqual(["JD", "JD", "JD", "JD"]);
    await expect(avatars.map((avatar) => Math.round(avatar.getBoundingClientRect().width))).toEqual([24, 36, 48, 56]);
  },
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

/** Paper PostCard: the 24px avatar draws its initials at 9px, semibold. */
export const ExtraSmallInitials: Story = {
  args: { fallback: "journey demonstrator", size: "xs" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const initials = canvas.getByText("JD");
    const box = canvas.getByRole("img", { name: "journey demonstrator" }).getBoundingClientRect();
    await expect([box.width, box.height]).toEqual([24, 24]);
    const style = getComputedStyle(initials);
    await expect(style.fontSize).toBe("9px");
    await expect(style.fontWeight).toBe("600");
  },
};
