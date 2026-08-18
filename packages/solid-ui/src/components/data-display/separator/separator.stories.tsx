import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { StoryStack } from "@/stories/lib/story-layout";
import { Separator } from "./separator";

const meta = {
  title: "Components/Data Display/Separator",
  component: Separator,
  tags: ["autodocs"],
  args: {
    orientation: "horizontal",
    decorative: true,
  },
  argTypes: {
    orientation: {
      control: "select",
      options: ["horizontal", "vertical"],
    },
    decorative: { control: "boolean" },
    class: { table: { disable: true } },
    ref: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Visual divider between content groups. Decorative by default and therefore hidden from assistive technology; pass decorative={false} only when the separation itself carries meaning.",
      },
    },
  },
} satisfies Meta<typeof Separator>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div class="w-64">
      <p class="text-base">Above</p>
      <Separator {...args} class="my-3" />
      <p class="text-base">Below</p>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const separator = canvas.getByRole("none");
    await expect(separator).toHaveAttribute(
      "data-orientation",
      "horizontal",
    );
  },
};

export const Variants: Story = {
  render: () => (
    <StoryStack>
      <div class="w-64">
        <p class="text-base">Above</p>
        <Separator class="my-3" />
        <p class="text-base">Below</p>
      </div>
      <div class="flex h-16 items-stretch gap-3">
        <span class="text-base">Left</span>
        <Separator orientation="vertical" />
        <span class="text-base">Right</span>
      </div>
    </StoryStack>
  ),
};
