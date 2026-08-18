import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { CopyField } from "./copy-field";

const meta = {
  title: "Patterns/Forms/CopyField",
  component: CopyField,
  tags: ["autodocs"],
  args: {
    value: "0x1234567890abcdef",
    copyLabel: "address",
  },
  argTypes: {
    value: { control: "text" },
    copyLabel: { control: "text" },
    wrap: { control: "boolean" },
    class: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "A read-only value row with a copy button that writes the value to the clipboard and confirms with a check mark for two seconds. Use it for addresses, invite codes, and IDs.",
      },
    },
  },
} satisfies Meta<typeof CopyField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Copy address" });

    await userEvent.click(button);
    await expect(
      canvas.getByRole("button", { name: "address copied" }),
    ).toBeInTheDocument();
  },
};

export const LongContent: Story = {
  args: {
    value:
      "0x9f8e7d6c5b4a39281706f5e4d3c2b1a0f9e8d7c6b5a4938271605f4e3d2c1b0",
    wrap: true,
  },
};
