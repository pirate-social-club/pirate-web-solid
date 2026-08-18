import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Input } from "./input";

const meta = {
  title: "Components/Forms/Input",
  component: Input,
  tags: ["autodocs"],
  args: {
    placeholder: "Type something…",
    "aria-label": "Name",
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "flat"],
    },
    size: {
      control: "select",
      options: ["default", "lg", "title"],
    },
    type: {
      control: "select",
      options: ["text", "email", "password", "number", "search"],
    },
    class: { table: { disable: true } },
    dir: { table: { disable: true } },
    name: { table: { disable: true } },
    ref: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "The styled native input element. Use Input inside a form or a TextField compound control; on its own it carries no label or validation semantics. Do not pass label, description, or error props here: that is the TextField job.",
      },
    },
  },
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Name" }) as HTMLInputElement;

    await userEvent.type(input, "hello solid");
    await expect(input).toHaveValue("hello solid");
  },
};

export const Variants: Story = {
  render: () => (
    <div class="flex w-80 flex-col gap-3">
      <Input aria-label="Default input" placeholder="Default" />
      <Input aria-label="Flat input" variant="flat" placeholder="Flat" />
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div class="flex w-80 flex-col gap-3">
      <Input aria-label="Default size input" placeholder="Default" />
      <Input aria-label="Large input" size="lg" placeholder="Large" />
      <Input aria-label="Title input" size="title" placeholder="Title" />
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("textbox")).toBeDisabled();
  },
};
