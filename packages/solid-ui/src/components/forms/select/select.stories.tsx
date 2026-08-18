import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { controlledRender } from "@/stories/lib/controlled";
import {
  optionDisabled,
  optionLabel,
  optionValue,
  sortOptions,
  type DemoOption,
} from "@/stories/lib/fixtures";
import { Select } from "./select";

const longOptions: DemoOption[] = [
  {
    value: "top",
    label:
      "Top rated by listeners across the whole season, including repeat plays and completed study sessions",
  },
  { value: "new", label: "Newest" },
];

const meta = {
  title: "Components/Forms/Select",
  component: Select,
  tags: ["autodocs"],
  render: controlledRender(
    (args) => args.value ?? null,
    (value, setValue, args) => (
      <div class="w-80">
        <Select
          {...args}
          aria-label="Sort order"
          value={value()}
          onChange={(next) => {
            setValue(next);
            args.onChange?.(next);
          }}
        />
      </div>
    ),
  ),
  args: {
    onChange: fn(),
    options: sortOptions,
    optionValue,
    optionLabel,
    optionDisabled,
    placeholder: "Pick one",
  },
  argTypes: {
    onChange: { table: { disable: true } },
    options: { table: { disable: true } },
    optionValue: { table: { disable: true } },
    optionLabel: { table: { disable: true } },
    optionDisabled: { table: { disable: true } },
    class: { table: { disable: true } },
    triggerClass: { table: { disable: true } },
    contentClass: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "A popup menu of mutually exclusive options. Data-driven: feed it options plus optionValue/optionLabel accessors and it renders the trigger, popup listbox, and hidden form input. Use it for long option lists where a RadioGroup would dominate the screen. Do not use it for searchable input: that is a Combobox.",
      },
    },
  },
} satisfies Meta<typeof Select<DemoOption>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Sort order" });

    await userEvent.click(trigger);
    const option = await within(document.body).findByRole("option", {
      name: "Top rated",
    });
    await userEvent.click(option);

    await expect(args.onChange).toHaveBeenCalledWith("top");
    await expect(trigger).toHaveTextContent("Top rated");
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button")).toBeDisabled();
  },
};

export const LongContent: Story = {
  args: {
    value: "top",
    options: longOptions,
  },
  render: (args) => (
    <div class="w-96">
      <Select {...args} aria-label="Sort order" />
    </div>
  ),
};
