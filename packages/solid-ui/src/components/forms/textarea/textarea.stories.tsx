import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { boardWidth } from "@/stories/lib/story-measure";
import { Textarea } from "./textarea";

const meta = {
  title: "Components/Forms/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  args: {
    placeholder: "Write something…",
    "aria-label": "Notes",
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "flat"],
    },
    class: { table: { disable: true } },
    dir: { table: { disable: true } },
    ref: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "The styled native textarea element. Use Textarea for multi-line free text; on its own it carries no label or validation semantics. For auto-growing height use AutoResizeTextarea.",
      },
    },
  },
} satisfies Meta<typeof Textarea>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole("textbox", { name: "Notes" });

    await userEvent.type(textarea, "hello solid");
    await expect(textarea).toHaveValue("hello solid");
  },
};

export const Variants: Story = {
  render: () => (
    <div class="flex w-80 flex-col gap-3">
      <Textarea aria-label="Default textarea" placeholder="Default" />
      <Textarea aria-label="Flat textarea" variant="flat" placeholder="Flat" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fieldStyle = getComputedStyle(canvas.getByRole("textbox", { name: "Default textarea" }));
    const flatStyle = getComputedStyle(canvas.getByRole("textbox", { name: "Flat textarea" }));
    // Paper draws no resize grip on either variant.
    await expect(fieldStyle.resize).toBe("none");
    await expect(flatStyle.resize).toBe("none");
    // Default: 16px inline and 12px block padding; flat drops border and padding.
    await expect([fieldStyle.paddingLeft, fieldStyle.paddingTop]).toEqual(["16px", "12px"]);
    await expect([flatStyle.paddingLeft, flatStyle.paddingTop, flatStyle.borderTopWidth]).toEqual(["0px", "0px", "0px"]);
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    value: "Locked content",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("textbox")).toBeDisabled();
  },
};

export const LongContent: Story = {
  args: {
    value:
      "A deliberately long value that wraps across several lines to show line wrapping and the default minimum height: the tide came in around four, the boats swung on their moorings, and the whole harbor turned silver in the last light before the rain arrived.",
    // Paper draws the box grown to its wrapped lines in a 320px column. Size it
    // to its content rather than a fixed row count, which would depend on how
    // the installed font wraps the text.
    class: "[field-sizing:content]",
  },
  render: (args) => (
    <div class="w-80 max-w-full">
      <Textarea {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const textarea = within(canvasElement).getByRole("textbox", { name: "Notes" });
    await expect(Math.round(textarea.getBoundingClientRect().width)).toBe(boardWidth(320));
    // Every wrapped line is visible; the box does not scroll at the 112px minimum.
    await expect(textarea.scrollHeight).toBeLessThanOrEqual(textarea.clientHeight);
    await expect(textarea.getBoundingClientRect().height).toBeGreaterThan(112);
  },
};
