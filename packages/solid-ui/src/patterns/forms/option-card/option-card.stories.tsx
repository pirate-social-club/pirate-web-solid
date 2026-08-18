import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { OptionCard } from "./option-card";

const meta = {
  title: "Patterns/Forms/OptionCard",
  component: OptionCard,
  tags: ["autodocs"],
  args: {
    title: "Monthly",
    description: "Billed every month.",
    onClick: fn(),
  },
  argTypes: {
    onClick: { table: { disable: true } },
    variant: {
      control: "select",
      options: ["default", "selected"],
    },
    class: { table: { disable: true } },
    icon: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "A single-choice card button with a RadioIndicator, title, description, and optional leading icon. Used inside forms as a friendly alternative to a bare RadioGroup; the host owns selection state. Do not use it for multi-select.",
      },
    },
  },
} satisfies Meta<typeof OptionCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const card = canvas.getByRole("button", { name: /Monthly/ });

    await userEvent.click(card);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

export const Variants: Story = {
  render: () => (
    <div class="flex w-96 flex-col gap-3">
      <OptionCard title="Weekly" description="Billed every week." />
      <OptionCard title="Monthly" description="Billed every month." selected />
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    disabled: true,
    disabledHint: "Not available in your region.",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button")).toBeDisabled();
  },
};
