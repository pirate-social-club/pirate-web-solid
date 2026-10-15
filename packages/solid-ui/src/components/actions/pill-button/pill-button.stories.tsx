import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { StoryRow, StoryStack } from "@/stories/lib/story-layout";
import { PillButton, pillButtonVariants } from "./pill-button";

const meta = {
  title: "Components/Actions/PillButton",
  component: PillButton,
  tags: ["autodocs"],
  args: {
    children: "Best",
    tone: "default",
    disabled: false,
  },
  argTypes: {
    tone: { control: "select", options: ["default", "selected"] },
    disabled: { control: "boolean" },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Rounded filter-style button with a `default` and `selected` tone. Used for sort orders, vote options, and single-choice filter rows. Tone is visual only; set `aria-pressed` yourself for toggle semantics.",
      },
    },
  },
} satisfies Meta<typeof PillButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pill = canvas.getByRole("button", { name: "Best" });
    await userEvent.click(pill);
    await expect(pill).toHaveFocus();
  },
};

export const Variants: Story = {
  render: () => (
    <StoryStack>
      <StoryRow>
        <PillButton>Best</PillButton>
        <PillButton tone="selected">Top</PillButton>
      </StoryRow>
      <StoryRow>
        <PillButton tone="selected" aria-pressed="true">
          Original
        </PillButton>
        <PillButton aria-pressed="false">Remix</PillButton>
      </StoryRow>
    </StoryStack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Original", pressed: true }),
    ).toBeVisible();
  },
};

/** Paper's Hover row: both tones in their pointer-over state, drawn statically. */
export const Hover: Story = {
  render: () => (
    <StoryRow>
      <PillButton class="bg-card-hover text-foreground">Best</PillButton>
      <PillButton class="bg-primary-hover" tone="selected">Top</PillButton>
    </StoryRow>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The static classes mirror the recipe's own hover utilities.
    const defaultTone = pillButtonVariants({ tone: "default" }).split(" ");
    await expect(defaultTone).toContain("hover:bg-card-hover");
    await expect(defaultTone).toContain("hover:text-foreground");
    await expect(pillButtonVariants({ tone: "selected" }).split(" ")).toContain("hover:bg-primary-hover");

    const best = canvas.getByRole("button", { name: "Best" });
    await expect(best).toHaveClass("bg-card-hover", "text-foreground");
    await expect(best).not.toHaveClass("bg-card");
    await expect(best).not.toHaveClass("text-muted-foreground");
    const top = canvas.getByRole("button", { name: "Top" });
    await expect(top).toHaveClass("bg-primary-hover");
    await expect(top).not.toHaveClass("bg-primary");
  },
};

export const Disabled: Story = {
  args: {
    children: "Locked",
    disabled: true,
  },
};
