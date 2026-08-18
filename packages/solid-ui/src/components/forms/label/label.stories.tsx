import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { StoryStack } from "@/stories/lib/story-layout";
import { Label } from "./label";

const meta = {
  title: "Components/Forms/Label",
  component: Label,
  tags: ["autodocs"],
  args: {
    children: "Display name",
  },
  argTypes: {
    tone: {
      control: "select",
      options: ["default", "muted"],
    },
    class: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "The native label element with the label typography recipe. Use it inside TextField or any form that owns its labels; tone muted dims secondary copy. It stays a real label element so for/htmlFor and peer styling keep working.",
      },
    },
  },
} satisfies Meta<typeof Label>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Display name")).toBeVisible();
  },
};

export const Variants: Story = {
  render: () => (
    <StoryStack>
      <Label>Display name</Label>
      <Label tone="muted">Optional</Label>
    </StoryStack>
  ),
};
