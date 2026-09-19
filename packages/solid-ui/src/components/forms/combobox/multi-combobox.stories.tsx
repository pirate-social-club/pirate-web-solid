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
import { MultiCombobox, type MultiComboboxProps } from "./multi-combobox";

const meta = {
  title: "Components/Forms/MultiCombobox",
  component: MultiCombobox,
  tags: ["autodocs"],
  render: controlledRender<MultiComboboxProps<DemoOption>, readonly string[] | undefined>(
    (args) => args.value,
    (value, setValue, args) => (
      <MultiCombobox
        {...args}
        aria-label="Sort order"
        value={value()}
        onChange={(next) => {
          setValue(next);
          args.onChange?.(next);
        }}
      />
    ),
  ),
  args: {
    onChange: fn(),
    options: sortOptions,
    optionValue,
    optionLabel,
    optionDisabled,
    placeholder: "Search",
  },
  argTypes: {
    onChange: { table: { disable: true } },
    options: { table: { disable: true } },
    optionValue: { table: { disable: true } },
    optionLabel: { table: { disable: true } },
    optionDisabled: { table: { disable: true } },
    class: { table: { disable: true } },
    inputClass: { table: { disable: true } },
    contentClass: { table: { disable: true } },
    value: { table: { disable: true } },
    defaultValue: { table: { disable: true } },
    removeLabel: { table: { disable: true } },
  },
  parameters: { layout: "centered", a11y: { test: "error" } },
} satisfies Meta<typeof MultiCombobox<DemoOption>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("combobox", { name: "Sort order" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /^Remove / })).toBeNull();
  },
};

export const WithChips: Story = {
  name: "Selected values as chips",
  args: { value: ["top", "new"] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);

    await userEvent.click(canvas.getByRole("button", { name: "Remove Newest" }));
    await expect(canvas.getAllByRole("button", { name: /^Remove / })).toHaveLength(1);
  },
};

export const Disabled: Story = {
  args: { disabled: true, value: ["top"] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("combobox", { name: "Sort order" })).toBeDisabled();
  },
};

export const Mobile: Story = {
  args: { value: ["top", "new"] },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

