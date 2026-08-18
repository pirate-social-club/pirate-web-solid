import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { IconMusicNote } from "@/components/media/icons";
import { StoryRow, StoryStack } from "@/stories/lib/story-layout";
import { Chip } from "./chip";

const meta = {
  title: "Components/Actions/Chip",
  component: Chip,
  tags: ["autodocs"],
  args: {
    children: "New release",
    variant: "default",
    size: "md",
    disabled: false,
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "selected", "outline", "active"],
    },
    size: { control: "select", options: ["sm", "md"] },
    disabled: { control: "boolean" },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Compact pill-shaped action with visual `variant` states (default, selected, outline, active) and two sizes. Selection styling is visual only; set `aria-pressed` yourself for toggle semantics. Use it for short, filterable labels such as tags or feed filters; do not use it for primary form actions.",
      },
    },
  },
} satisfies Meta<typeof Chip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const chip = canvas.getByRole("button", { name: "New release" });
    await userEvent.click(chip);
    await expect(chip).toHaveFocus();
  },
};

export const Variants: Story = {
  render: () => (
    <StoryStack>
      <StoryRow>
        <Chip>Default</Chip>
        <Chip variant="selected">Selected</Chip>
        <Chip variant="outline">Outline</Chip>
        <Chip variant="active">Active</Chip>
      </StoryRow>
      <StoryRow>
        <Chip variant="selected" aria-pressed="true">
          Solo
        </Chip>
        <Chip aria-pressed="false">Collab</Chip>
        <Chip aria-pressed="false">Open Mic</Chip>
      </StoryRow>
      <StoryRow>
        <Chip leadingIcon={<IconMusicNote class="size-4" />}>Music</Chip>
      </StoryRow>
    </StoryStack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Solo", pressed: true }),
    ).toBeVisible();
  },
};

export const Sizes: Story = {
  render: () => (
    <StoryRow>
      <Chip size="sm">Small</Chip>
      <Chip size="md">Medium</Chip>
      <Chip variant="selected" size="sm">
        Small selected
      </Chip>
      <Chip variant="selected" size="md">
        Medium selected
      </Chip>
    </StoryRow>
  ),
};

export const Disabled: Story = {
  render: () => (
    <StoryRow>
      <Chip disabled>Disabled</Chip>
      <Chip variant="selected" disabled>
        Disabled selected
      </Chip>
    </StoryRow>
  ),
};
