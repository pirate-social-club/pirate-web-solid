import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import {
  ResponsiveOptionSelect,
  type ResponsiveOptionSelectOption,
} from "./responsive-option-select";

const sortOptions: ResponsiveOptionSelectOption[] = [
  { label: "Best", value: "best" },
  { label: "New", value: "new" },
  { label: "Top", value: "top" },
];

const meta = {
  title: "Patterns/Forms/ResponsiveOptionSelect",
  component: ResponsiveOptionSelect,
  parameters: {
    docs: {
      description: {
        component:
          "Responsive option picker: bottom sheet on small viewports, pill select on desktop. Options carry label, description, icon, and disabled reason; selection reports through onValueChange. Custom mobile triggers are supplied through mobileTriggerContent and must be a single control or content-only element.",
      },
    },
  },
  args: {
    ariaLabel: "Sort options",
    drawerTitle: "Sort",
    options: sortOptions,
    placeholder: "Sort by",
    value: "best",
  },
  argTypes: {
    value: {
      control: "select",
      options: ["best", "new", "top"],
    },
  },
} satisfies Meta<typeof ResponsiveOptionSelect>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithDescriptions: Story = {
  args: {
    value: "top",
    options: [
      { label: "Best", value: "best", description: "Most popular posts" },
      { label: "New", value: "new", description: "Latest posts first" },
      { label: "Top", value: "top", description: "Highest scored posts" },
    ],
  },
};

export const WithDisabledOption: Story = {
  args: {
    value: "best",
    options: [
      { label: "Best", value: "best" },
      { label: "New", value: "new" },
      { label: "Top", value: "top", disabled: true, disabledReason: "Requires login" },
    ],
  },
};

export const Interactive: Story = {
  render: () => {
    const [value, setValue] = createSignal("best");
    return (
      <ResponsiveOptionSelect
        ariaLabel="Sort feed"
        drawerTitle="Sort feed"
        onValueChange={setValue}
        options={sortOptions}
        value={value()}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Desktop viewport: the pill select is the visible control.
    const trigger = canvas.getAllByRole("combobox", { name: "Sort feed" })[0];
    await expect(trigger).toBeVisible();
    await userEvent.click(trigger);
    const listbox = await within(document.body).findByRole("listbox");
    await expect(listbox).toBeVisible();
    await userEvent.click(within(listbox).getByRole("option", { name: "New" }));
    await expect(trigger).toHaveTextContent("New");
  },
};
