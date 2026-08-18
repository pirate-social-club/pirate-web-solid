import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { Skeleton } from "./skeleton";

const meta = {
  title: "Components/Feedback/Skeleton",
  component: Skeleton,
  tags: ["autodocs"],
  args: {
    class: "h-20 w-full",
  },
  argTypes: {
    class: { table: { disable: true } },
    ref: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Placeholder surface shown while content streams in. Use Skeleton for blocks of unknown content (rows, covers, avatars) rather than spinners; never use it to represent unavailable content. Motion is disabled under prefers-reduced-motion.",
      },
    },
  },
} satisfies Meta<typeof Skeleton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div class="w-[calc(100vw-2rem)] max-w-full p-4">
      <Skeleton class={args.class} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const skeleton = canvasElement.querySelector(".animate-pulse");
    await expect(skeleton).toHaveClass("bg-surface-skeleton");
  },
};

export const Variants: Story = {
  render: () => (
    <div class="flex w-80 flex-col gap-4">
      <div class="flex items-center gap-3">
        <Skeleton class="size-11 rounded-full" />
        <div class="flex flex-1 flex-col gap-2">
          <Skeleton class="h-4 w-3/5" />
          <Skeleton class="h-4 w-2/5" />
        </div>
      </div>
      <Skeleton class="h-24 w-full rounded-[var(--radius-lg)]" />
      <Skeleton class="h-4 w-full" />
      <Skeleton class="h-4 w-4/5" />
    </div>
  ),
};
