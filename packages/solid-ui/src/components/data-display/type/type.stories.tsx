import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { Type } from "./type";

const meta = {
  title: "Components/Data Display/Type",
  component: Type,
  tags: ["autodocs"],
  args: {
    children: "The quick brown fox jumps over the lazy dog.",
  },
  argTypes: {
    variant: {
      control: "select",
      options: [
        "display",
        "h1",
        "h2",
        "h3",
        "h4",
        "body",
        "body-strong",
        "label",
        "caption",
        "overline",
      ],
    },
    as: {
      control: "select",
      options: ["span", "p", "h1", "h2", "h3", "h4", "div"],
    },
    class: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "The single typography primitive. Use Type for every text surface instead of free-styled text utilities; allowed variants are display, h1–h4, body, body-strong, label, caption, and overline. Body copy stays 16px. The as prop changes the rendered element without changing the recipe.",
      },
    },
  },
} satisfies Meta<typeof Type>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/quick brown fox/)).toBeVisible();
  },
};

export const Variants: Story = {
  render: () => (
    <div class="flex w-96 flex-col gap-3">
      <Type variant="display">Display</Type>
      <Type variant="h1">Heading 1</Type>
      <Type variant="h2">Heading 2</Type>
      <Type variant="h3">Heading 3</Type>
      <Type variant="h4">Heading 4</Type>
      <Type variant="body">
        Body — The quick brown fox jumps over the lazy dog.
      </Type>
      <Type variant="body-strong">Body strong</Type>
      <Type variant="label">Label</Type>
      <Type variant="caption">Caption — secondary copy.</Type>
      <Type variant="overline">Overline</Type>
    </div>
  ),
};
