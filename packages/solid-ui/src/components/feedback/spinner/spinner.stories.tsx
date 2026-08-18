import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { StoryRow, StoryStack } from "@/stories/lib/story-layout";
import { Spinner } from "./spinner";

const meta = {
  title: "Components/Feedback/Spinner",
  component: Spinner,
  tags: ["autodocs"],
  args: {
    size: "default",
    label: undefined,
  },
  argTypes: {
    size: {
      control: "select",
      options: ["sm", "default", "lg"],
    },
    label: { control: "text" },
    class: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Progress affordance with role=status. The default accessible name is Loading; pass a localized label prop where the app owns locale. Use it inside Button or IconButton loading states, or standalone inside busy surfaces.",
      },
    },
  },
} satisfies Meta<typeof Spinner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const spinner = canvas.getByRole("status", { name: "Loading" });
    await expect(spinner).toBeVisible();
  },
};

export const Sizes: Story = {
  render: () => (
    <StoryRow>
      <Spinner size="sm" />
      <Spinner />
      <Spinner size="lg" />
    </StoryRow>
  ),
};

export const Variants: Story = {
  render: () => (
    <StoryStack>
      <StoryRow>
        <Spinner label="Uploading cover art…" />
      </StoryRow>
    </StoryStack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("status", { name: "Uploading cover art…" }),
    ).toBeVisible();
  },
};
