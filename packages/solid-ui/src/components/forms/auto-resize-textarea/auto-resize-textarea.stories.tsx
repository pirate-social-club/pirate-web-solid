import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { AutoResizeTextarea } from "./auto-resize-textarea";

const meta = {
  title: "Components/Forms/AutoResizeTextarea",
  component: AutoResizeTextarea,
  tags: ["autodocs"],
  args: {
    placeholder: "Type to grow…",
    "aria-label": "Reply",
    maxRows: 5,
  },
  argTypes: {
    maxRows: { control: "number" },
    rows: { control: "number" },
    class: { table: { disable: true } },
    dir: { table: { disable: true } },
    ref: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "A textarea that grows with its content up to maxRows, then scrolls. Use it for reply boxes and comment fields where a fixed height would waste space. Do not use it for bulk editing surfaces where a scrollbar from the start is expected.",
      },
    },
  },
} satisfies Meta<typeof AutoResizeTextarea>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole("textbox", { name: "Reply" });

    const initialHeight = textarea.getBoundingClientRect().height;
    await userEvent.type(textarea, "line one\nline two\nline three");
    const grownHeight = textarea.getBoundingClientRect().height;

    await expect(grownHeight).toBeGreaterThan(initialHeight);
  },
};
