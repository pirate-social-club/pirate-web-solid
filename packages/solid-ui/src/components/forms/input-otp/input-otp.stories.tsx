import { createSignal, type ParentProps } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { boardWidth, widthOf } from "@/stories/lib/story-measure";
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

function OtpFrame(props: ParentProps) {
  return (
    <div class="w-[390px] max-w-[calc(100vw-2rem)] rounded-[var(--radius-xl)] bg-background p-5" data-testid="otp-frame">
      {props.children}
    </div>
  );
}

/** Paper's resting state: six empty cells with the first one focused. */
export const Default: Story = {
  render: (args) => {
    const [value, setValue] = createSignal("");
    return (
      <OtpFrame>
        <InputOTP {...args} onChange={setValue} value={value()} />
      </OtpFrame>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const inputs = canvas.getAllByRole("textbox");
    await expect(inputs).toHaveLength(6);
    for (const input of inputs) await expect(input).toHaveValue("");
    // Paper draws the first cell focused. Autofocus can lose the race with the
    // Storybook manager for page focus, so put focus there the way a user would.
    await userEvent.click(inputs[0]);
    await expect(inputs[0]).toHaveFocus();
    for (const input of inputs) await expect(input).toHaveValue("");
  },
};

/** Typing advances focus cell by cell; kept apart so Default rests on the board state. */
export const Interaction: Story = {
  render: (args) => {
    const [value, setValue] = createSignal("");
    return (
      <OtpFrame>
        <InputOTP {...args} onChange={setValue} value={value()} />
      </OtpFrame>
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
  // The same 390 phone frame as Default, so the cells keep their board width.
  render: (args) => (
    <OtpFrame>
      <InputOTP {...args} value="481205" />
    </OtpFrame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(widthOf(canvas.getByTestId("otp-frame"))).toBe(boardWidth(390));
    const inputs = canvas.getAllByRole("textbox");
    await expect(inputs.map((input) => (input as HTMLInputElement).value).join("")).toBe("481205");
    const defaultWidth = widthOf(inputs[0]);
    for (const input of inputs) await expect(widthOf(input)).toBe(defaultWidth);
  },
};
