import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { controlledRender } from "@/stories/lib/controlled";
import { EditableNumberInput } from "./editable-number-input";

const meta = {
  title: "Components/Forms/EditableNumberInput",
  component: EditableNumberInput,
  tags: ["autodocs"],
  render: controlledRender(
    (args) => args.value,
    (value, setValue, args) => (
      <EditableNumberInput
        {...args}
        aria-label="Duration"
        value={value()}
        onValueChange={(next) => {
          setValue(next);
          args.onValueChange?.(next);
        }}
      />
    ),
  ),
  args: {
    value: 30,
    onValueChange: fn(),
  },
  argTypes: {
    value: { control: "number" },
    onValueChange: { table: { disable: true } },
    class: { table: { disable: true } },
    dir: { table: { disable: true } },
    ref: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "A number input whose draft text is local while focused: the user can clear or edit the field without committing partial numbers, and blur restores the canonical value. Use it for duration and quantity fields. Do not use it where every keystroke must commit.",
      },
    },
  },
} satisfies Meta<typeof EditableNumberInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("spinbutton", { name: "Duration" });

    await userEvent.clear(input);
    await userEvent.type(input, "45");
    await userEvent.tab();

    await expect(input).toHaveValue("45");
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("spinbutton")).toBeDisabled();
  },
};
