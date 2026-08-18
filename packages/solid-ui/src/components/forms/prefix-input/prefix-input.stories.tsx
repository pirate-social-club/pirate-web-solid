import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { PrefixInput } from "./prefix-input";

const meta = {
  title: "Components/Forms/PrefixInput",
  component: PrefixInput,
  tags: ["autodocs"],
  args: {
    prefix: "$",
    "aria-label": "Amount",
    placeholder: "0.00",
  },
  argTypes: {
    size: {
      control: "select",
      options: ["default", "lg"],
    },
    prefix: { control: "text" },
    class: { table: { disable: true } },
    dir: { table: { disable: true } },
    ref: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "An input with a fixed leading adornment column for a unit, symbol, or domain. The prefix is decorative chrome, not part of the value. Use it for amounts, quantities, and handles; do not use it for search (use a plain Input with an icon if needed).",
      },
    },
  },
} satisfies Meta<typeof PrefixInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Amount" });

    await userEvent.type(input, "12");
    await expect(input).toHaveValue("12");
  },
};

export const Sizes: Story = {
  render: () => (
    <div class="flex w-80 flex-col gap-3">
      <PrefixInput prefix="$" aria-label="Default size" placeholder="0.00" />
      <PrefixInput prefix="$" size="lg" aria-label="Large size" placeholder="0.00" />
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    disabled: true,
    value: "42",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("textbox")).toBeDisabled();
  },
};
