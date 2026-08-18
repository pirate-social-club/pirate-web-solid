import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { controlledRender } from "@/stories/lib/controlled";
import { StoryStack } from "@/stories/lib/story-layout";
import { CheckboxCard } from "./checkbox-card";

const meta = {
  title: "Patterns/Forms/CheckboxCard",
  component: CheckboxCard,
  tags: ["autodocs"],
  render: controlledRender(
    (args) => args.checked ?? false,
    (checked, setChecked, args) => (
      <StoryStack class="w-96">
        <CheckboxCard
          {...args}
          checked={checked()}
          onCheckedChange={(next) => {
            setChecked(next);
            args.onCheckedChange?.(next);
          }}
        />
      </StoryStack>
    ),
  ),
  args: {
    title: "Send email updates",
    description: "We will email you once a month at most.",
    onCheckedChange: fn(),
  },
  argTypes: {
    onCheckedChange: { table: { disable: true } },
    class: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "A selectable card row: one Checkbox plus title, description, and optional disabled hint. The whole card is the click target with native checkbox semantics. Use it for multi-select lists. Do not use it for mutually exclusive choices.",
      },
    },
  },
} satisfies Meta<typeof CheckboxCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const card = canvas.getByRole("checkbox", { name: "Send email updates" });

    await userEvent.click(card);
    await expect(args.onCheckedChange).toHaveBeenCalledWith(true);
    await expect(card).toBeChecked();
  },
};

export const Variants: Story = {
  render: () => (
    <StoryStack class="w-96">
      <CheckboxCard
        title="Send email updates"
        description="We will email you once a month at most."
        onCheckedChange={() => {}}
      />
      <CheckboxCard
        title="Send email updates"
        description="We will email you once a month at most."
        checked
        onCheckedChange={() => {}}
      />
    </StoryStack>
  ),
};

export const Disabled: Story = {
  args: {
    disabled: true,
    disabledHint: "Requires a verified account.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("checkbox", { name: "Send email updates" }),
    ).toBeDisabled();
  },
};

export const LongContent: Story = {
  args: {
    title: "Email updates with a deliberately long title that keeps going",
    description:
      "A longer description that wraps across lines to show how the card handles a lot of supporting copy without collapsing or truncating anything important.",
  },
};
