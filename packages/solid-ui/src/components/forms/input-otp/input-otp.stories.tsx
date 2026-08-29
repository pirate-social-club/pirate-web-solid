import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { InputOTP } from "./input-otp";

const meta = {
  title: "Components/Forms/InputOTP",
  component: InputOTP,
  tags: ["autodocs"],
  args: {
    "aria-label": "Verification code",
    autofocus: true,
    length: 6,
  },
  argTypes: {
    length: { control: "number" },
    autofocus: { control: "boolean" },
    class: { table: { disable: true } },
    onChange: { table: { disable: true } },
    value: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "A controlled one-time-password input made from individually focusable cells. It owns focus advance, paste distribution, and arrow/backspace navigation while the host owns the code value and submission.",
      },
    },
  },
} satisfies Meta<typeof InputOTP>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => {
    const [value, setValue] = createSignal("");
    return (
      <div class="w-[390px] rounded-[var(--radius-xl)] bg-background p-5">
        <InputOTP {...args} onChange={setValue} value={value()} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const inputs = canvas.getAllByRole("textbox");
    await userEvent.type(inputs[0], "48");
    await expect(inputs[0]).toHaveValue("4");
    await expect(inputs[1]).toHaveValue("8");
  },
};

export const Filled: Story = {
  args: { autofocus: false },
  render: (args) => <InputOTP {...args} value="481205" />,
};
