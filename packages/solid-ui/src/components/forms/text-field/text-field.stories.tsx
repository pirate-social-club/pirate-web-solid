import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import {
  TextField,
  TextFieldDescription,
  TextFieldErrorMessage,
  TextFieldInput,
  TextFieldLabel,
} from "./text-field";

const meta = {
  title: "Components/Forms/TextField",
  component: TextField,
  tags: ["autodocs"],
  args: {
    name: "display-name",
    defaultValue: "Example user",
  },
  argTypes: {
    class: { table: { disable: true } },
    ref: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "The labeled, validated compound input. Use TextField with TextFieldLabel, TextFieldInput, TextFieldDescription, and TextFieldErrorMessage whenever an input needs a visible label, helper copy, or validation messaging. Use the plain Input when the field already lives inside a form that owns its labels.",
      },
    },
  },
} satisfies Meta<typeof TextField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <TextField {...args}>
      <TextFieldLabel>Display name</TextFieldLabel>
      <TextFieldInput />
      <TextFieldDescription>
        This name is shown to other people on your profile.
      </TextFieldDescription>
    </TextField>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Display name" });

    await expect(input).toHaveValue("Example user");

    await userEvent.clear(input);
    await userEvent.type(input, "New name");
    await expect(input).toHaveValue("New name");
  },
};

export const Disabled: Story = {
  render: (args) => (
    <TextField {...args} disabled>
      <TextFieldLabel>Display name</TextFieldLabel>
      <TextFieldInput />
    </TextField>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("textbox", { name: "Display name" })).toBeDisabled();
  },
};

export const Error: Story = {
  render: (args) => (
    <TextField {...args} validationState="invalid" defaultValue="">
      <TextFieldLabel>Display name</TextFieldLabel>
      <TextFieldInput />
      <TextFieldErrorMessage>Display name is required.</TextFieldErrorMessage>
    </TextField>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Display name" });

    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(
      canvas.getByText("Display name is required."),
    ).toBeInTheDocument();
    await expect(input).toHaveAccessibleDescription(
      "Display name is required.",
    );
  },
};
