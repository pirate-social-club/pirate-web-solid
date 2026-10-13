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

const grownReply =
  "The box gets taller as the reply gets longer, one line at a time, so nothing is hidden while typing.";

const cappedReply =
  "Past five rows the box stops growing and the content scrolls inside it. This is a long reply that keeps going and going, well past the point where a taller box would push the rest of the page away, so the last lines stay out of view until you scroll the field itself. It keeps going a little longer still.";

function lineMetrics(textarea: HTMLTextAreaElement) {
  const style = getComputedStyle(textarea);
  const px = (value: string) => parseFloat(value) || 0;
  return {
    lineHeight: px(style.lineHeight),
    chrome:
      px(style.paddingTop)
      + px(style.paddingBottom)
      + px(style.borderTopWidth)
      + px(style.borderBottomWidth),
  };
}

/** Paper's Grown state: a three-line reply, the box tall enough to show all of it. */
export const Grown: Story = {
  render: (args) => (
    <div class="w-80 max-w-full">
      <AutoResizeTextarea {...args} value={grownReply} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const textarea = within(canvasElement).getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement;
    const { lineHeight } = lineMetrics(textarea);
    // Taller than one row, and every line visible without scrolling.
    await expect(textarea.getBoundingClientRect().height).toBeGreaterThan(lineHeight * 2);
    await expect(textarea.scrollHeight).toBeLessThanOrEqual(textarea.clientHeight);
  },
};

/** Paper's Capped state: past five rows the box stops growing and scrolls. */
export const Capped: Story = {
  render: (args) => (
    <div class="w-80 max-w-full">
      <AutoResizeTextarea {...args} value={cappedReply} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const textarea = within(canvasElement).getByRole("textbox", { name: "Reply" }) as HTMLTextAreaElement;
    const { lineHeight, chrome } = lineMetrics(textarea);
    const height = textarea.getBoundingClientRect().height;
    await expect(Math.abs(height - (5 * lineHeight + chrome))).toBeLessThanOrEqual(1);
    await expect(textarea.scrollHeight).toBeGreaterThan(textarea.clientHeight);
  },
};
