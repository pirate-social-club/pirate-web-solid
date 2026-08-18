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
import { Combobox } from "./combobox";

const longOptions: DemoOption[] = [
  {
    value: "top",
    label:
      "Top rated by listeners across the whole season, including repeat plays and completed study sessions (remastered 2026 edition)",
  },
  { value: "new", label: "Newest" },
];

const meta = {
  title: "Components/Forms/Combobox",
  component: Combobox,
  tags: ["autodocs"],
  render: controlledRender(
    (args) => args.value ?? null,
    (value, setValue, args) => (
      <Combobox
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
    placeholder: "Type to filter",
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
  },
  parameters: {
    docs: {
      description: {
        component:
          "A text input with an attached popup list of options. The input accepts free text; picking an option commits its value. Use it when the value set is large and users benefit from typing to narrow the list. Do not use it for short fixed lists: that is a Select.",
      },
    },
  },
} satisfies Meta<typeof Combobox<DemoOption>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Sort order" });

    await userEvent.click(canvas.getByRole("button"));
    const option = await within(document.body).findByRole("option", {
      name: "Top rated",
    });
    await userEvent.click(option);

    await expect(args.onChange).toHaveBeenCalledWith("top");
    await expect(input).toHaveValue("Top rated");
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("combobox")).toBeDisabled();
  },
};

export const LongContent: Story = {
  args: {
    value: "top",
    options: longOptions,
  },
  render: (args) => (
    <div class="w-96">
      <Combobox {...args} aria-label="Sort order" />
    </div>
  ),
};
