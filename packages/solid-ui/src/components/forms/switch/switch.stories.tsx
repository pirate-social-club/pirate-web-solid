import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { controlledRender } from "@/stories/lib/controlled";
import { StoryStack } from "@/stories/lib/story-layout";
import {
  Switch,
  SwitchDescription,
  SwitchErrorMessage,
  SwitchLabel,
} from "./switch";

const meta = {
  title: "Components/Forms/Switch",
  component: Switch,
  tags: ["autodocs"],
  render: controlledRender(
    (args) => args.checked ?? false,
    (checked, setChecked, args) => (
      <Switch
        {...args}
        checked={checked()}
        onChange={(next) => {
          setChecked(next);
          args.onChange?.(next);
        }}
      >
        <SwitchLabel>Dark mode</SwitchLabel>
      </Switch>
    ),
  ),
  args: {
    checked: false,
    onChange: fn(),
  },
  argTypes: {
    checked: { control: "boolean" },
    onChange: { table: { disable: true } },
    class: { table: { disable: true } },
    controlClass: { table: { disable: true } },
    thumbClass: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "An on/off switch with a sliding knob. Use it for settings that take effect immediately; do not use it for consent inside forms where a Checkbox communicates the two states more explicitly.",
      },
    },
  },
} satisfies Meta<typeof Switch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("switch", { name: "Dark mode" });

    await userEvent.click(input);
    await expect(args.onChange).toHaveBeenCalledWith(true);
    await expect(input).toBeChecked();
  },
};

export const Variants: Story = {
  render: () => (
    <StoryStack>
      <Switch aria-label="Off" />
      <Switch aria-label="On" defaultChecked />
      <Switch aria-label="Disabled" disabled />
      <Switch>
        <div class="flex flex-col">
          <SwitchLabel>Dark mode</SwitchLabel>
          <SwitchDescription>Use a darker color scheme.</SwitchDescription>
        </div>
      </Switch>
    </StoryStack>
  ),
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("switch")).toBeDisabled();
  },
};

export const Error: Story = {
  render: () => (
    <Switch validationState="invalid">
      <div class="flex flex-col">
        <SwitchLabel>Dark mode</SwitchLabel>
        <SwitchErrorMessage>Dark mode is required.</SwitchErrorMessage>
      </div>
    </Switch>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Dark mode is required."),
    ).toBeInTheDocument();
  },
};
