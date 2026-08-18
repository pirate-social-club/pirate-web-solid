import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { IconCheck } from "@/components/media/icons";
import { StoryRow } from "@/stories/lib/story-layout";
import { BadgedCircle } from "./badged-circle";

const subject = (
  <span class="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
    <span class="text-base font-semibold">P</span>
  </span>
);

const verifiedBadge = (
  <span class="grid size-full place-items-center bg-success text-success-foreground">
    <IconCheck class="size-3" />
  </span>
);

const meta = {
  title: "Components/Data Display/BadgedCircle",
  component: BadgedCircle,
  tags: ["autodocs"],
  args: {
    badge: verifiedBadge,
    badgeLabel: "Verified",
    badgeSize: 18,
    children: subject,
  },
  argTypes: {
    badgeSize: { control: "number" },
    badgeOffsetPercent: { control: "number" },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Overlays a circular badge onto a circular subject. The frame is sized from `badgeSize` plus `badgePadding`, offset from the bottom-right corner via percentage offsets. Pass `badgeLabel` to expose the badge to assistive technology (`role=\"img\"`).",
      },
    },
  },
} satisfies Meta<typeof BadgedCircle>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const badge = canvas.getByRole("img", { name: "Verified" });
    await expect(badge).toBeVisible();
  },
};

export const Variants: Story = {
  render: () => (
    <StoryRow>
      <BadgedCircle
        badge={
          <span class="grid size-full place-items-center rounded-full bg-primary text-primary-foreground">
            5
          </span>
        }
        badgeSize={18}
      >
        {subject}
      </BadgedCircle>
      <BadgedCircle
        badge={verifiedBadge}
        badgeLabel="Verified"
        badgeSize={20}
        badgeOffsetPercent={24}
      >
        {subject}
      </BadgedCircle>
    </StoryRow>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("img", { name: "Verified" }),
    ).toBeVisible();
  },
};
