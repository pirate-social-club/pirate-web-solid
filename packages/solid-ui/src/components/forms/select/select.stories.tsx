import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

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

/** Paper's resting state: the placeholder, closed and unfocused. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Sort order" });
    await expect(trigger).toHaveTextContent("Pick one");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).not.toHaveFocus();
  },
};

/** Paper's Open state: Top rated selected and the list showing beneath. */
export const Open: Story = {
  args: {
    value: "top",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Sort order" });
    await expect(trigger).toHaveTextContent("Top rated");

    await userEvent.click(trigger);
    const listbox = await within(document.body).findByRole("listbox");
    await expect(listbox).toBeVisible();
    await expect(within(listbox).getAllByRole("option")).toHaveLength(3);
    await expect(
      within(listbox).getByRole("option", { name: "Top rated" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  },
};

/** Picking an option commits its value; kept apart so Default rests on the board state. */
export const Interaction: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Sort order" });

    await userEvent.click(trigger);
    const option = await within(document.body).findByRole("option", {
      name: "Top rated",
    });
    await userEvent.click(option);

    await expect(args.onChange).toHaveBeenCalledWith("top");
    await waitFor(() => expect(trigger).toHaveTextContent("Top rated"));
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

/** Paper: the option list opens 4px below the field. */
export const ListGap: Story = {
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "Sort order" });
    await userEvent.click(trigger);
    const listbox = await within(document.body).findByRole("listbox");
    const positioner = listbox.closest("[data-popper-positioner]");
    if (!(positioner instanceof HTMLElement)) throw new Error("no popper positioner");
    await waitFor(() =>
      expect(Math.round(positioner.getBoundingClientRect().top - trigger.getBoundingClientRect().bottom)).toBe(4),
    );
    await userEvent.keyboard("{Escape}");
  },
};
