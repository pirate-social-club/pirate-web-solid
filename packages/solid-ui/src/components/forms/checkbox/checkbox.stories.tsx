import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { controlledRender } from "@/stories/lib/controlled";
import { StoryStack } from "@/stories/lib/story-layout";
import { Checkbox, CheckboxDescription, CheckboxLabel } from "./checkbox";

const meta = {
  title: "Components/Forms/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
  render: controlledRender(
    (args) => args.checked ?? false,
    (checked, setChecked, args) => (
      <Checkbox
        {...args}
        checked={checked()}
        onChange={(next) => {
          setChecked(next);
          args.onChange?.(next);
        }}
      >
        <CheckboxLabel>Accept terms</CheckboxLabel>
      </Checkbox>
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
    indicatorClass: { table: { disable: true } },
    validationState: {
      control: "select",
      options: ["valid", "invalid"],
    },
  },
  parameters: {
    docs: {
      description: {
        component:
          "A checkbox control with a visible styled box and a real, keyboard-focusable input. Use it for boolean choices inside forms; pair it with CheckboxLabel for a clickable label or CheckboxDescription for supporting copy. Do not use it for row-level multi-select cards: that is the CheckboxCard pattern.",
      },
    },
  },
} satisfies Meta<typeof Checkbox>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole("checkbox", { name: "Accept terms" });

    await userEvent.click(checkbox);
    await expect(args.onChange).toHaveBeenCalledWith(true);
    await expect(checkbox).toBeChecked();
  },
};

export const Variants: Story = {
  render: () => (
    <StoryStack>
      <Checkbox aria-label="Unchecked" />
      <Checkbox aria-label="Checked" defaultChecked />
      <Checkbox aria-label="Indeterminate" defaultChecked indeterminate />
      <Checkbox aria-label="Disabled" disabled />
      <Checkbox defaultChecked>
        <div class="flex flex-col">
          <CheckboxLabel>Send email updates</CheckboxLabel>
          <CheckboxDescription>
            We will email you once a month at most.
          </CheckboxDescription>
        </div>
      </Checkbox>
    </StoryStack>
  ),
};
