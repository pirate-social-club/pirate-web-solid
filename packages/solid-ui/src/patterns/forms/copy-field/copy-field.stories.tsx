import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, spyOn, userEvent, within } from "storybook/test";

import { boardWidth, widthOf } from "@/stories/lib/story-measure";
import { CopyField } from "./copy-field";

const meta = {
  title: "Patterns/Forms/CopyField",
  component: CopyField,
  tags: ["autodocs"],
  args: {
    value: "0x1234567890abcdef",
    copyLabel: "address",
  },
  // Paper draws every row 448px wide.
  render: (args) => (
    <div class="w-[28rem] max-w-full" data-testid="copy-frame">
      <CopyField {...args} />
    </div>
  ),
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

/** Paper's resting row: the value and the copy button. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Copy address" })).toBeVisible();
    await expect(widthOf(canvas.getByTestId("copy-frame"))).toBe(boardWidth(448));
  },
};

/** Paper's Copied state: the button shows a check for two seconds after a press. */
export const Copied: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Copy address" });
    const writeText = spyOn(navigator.clipboard, "writeText").mockResolvedValue();

    try {
      await userEvent.click(button);
      await expect(writeText).toHaveBeenCalledWith("0x1234567890abcdef");
      await expect(
        canvas.getByRole("button", { name: "address copied" }),
      ).toBeInTheDocument();
    } finally {
      writeText.mockRestore();
    }
  },
};

export const LongContent: Story = {
  args: {
    value:
      "0x9f8e7d6c5b4a39281706f5e4d3c2b1a0f9e8d7c6b5a4938271605f4e3d2c1b0",
    wrap: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const frame = canvas.getByTestId("copy-frame");
    await expect(widthOf(frame)).toBe(boardWidth(448));
    // With wrap on, the long value breaks onto a second line inside the row.
    const value = canvas.getByText(/^0x9f8e7d6c/);
    const lineHeight = parseFloat(getComputedStyle(value).lineHeight);
    await expect(value.getBoundingClientRect().height).toBeGreaterThanOrEqual(lineHeight * 2 - 1);
    await expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth);
  },
};
