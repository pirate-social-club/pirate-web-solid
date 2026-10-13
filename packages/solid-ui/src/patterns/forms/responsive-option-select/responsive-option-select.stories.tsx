import { createSignal, type ParentProps } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { untilViewportBelow } from "@/stories/lib/story-measure";
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
          "Responsive option picker: bottom sheet on small viewports, pill select on desktop. Options carry label, description, icon, and disabled reason; selection reports through onValueChange. Custom mobile triggers are supplied through mobileTriggerContent, replace the default trigger content, and must be content-only; the trigger keeps button semantics and the aria label.",
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
    const trigger = canvas.getByRole("button", { name: "Sort feed" });
    await expect(trigger).toBeVisible();
    await userEvent.click(trigger);
    const listbox = await within(document.body).findByRole("listbox");
    await expect(listbox).toBeVisible();
    await userEvent.click(within(listbox).getByRole("option", { name: "New" }));
    await waitFor(() => expect(trigger).toHaveTextContent("New"));
  },
};

/** Paper's desktop popup: the pill opens a list with the current option checked. */
export const DesktopOpen: Story = {
  name: "Desktop open",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Sort options" });
    await userEvent.click(trigger);
    const listbox = await within(document.body).findByRole("listbox");
    await expect(listbox).toBeVisible();
    await expect(
      within(listbox).getByRole("option", { name: "Best" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  },
};

/**
 * Below md the control is a full-width pill. The frame stands in for a 390
 * phone's 358px content column.
 */
function PhoneFrame(props: ParentProps) {
  return (
    <div class="w-[358px] max-w-[calc(100vw-2rem)]" data-testid="phone-frame">
      {props.children}
    </div>
  );
}

export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: (args) => (
    <PhoneFrame>
      <ResponsiveOptionSelect {...args} />
    </PhoneFrame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The sheet trigger only renders below md; on a wider canvas the pill
    // select shows instead and there is nothing phone-sized to measure.
    if (!(await untilViewportBelow(768))) return;
    const trigger = canvas.getByRole("button", { name: "Sort options" });
    await expect(trigger).toBeVisible();
    await expect(Math.round(trigger.getBoundingClientRect().width)).toBe(
      Math.round(canvas.getByTestId("phone-frame").getBoundingClientRect().width),
    );
  },
};

/** Paper's phone sheet: full-width option buttons with the current one filled and checked. */
export const MobileOpen: Story = {
  name: "Mobile open",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: (args) => (
    <PhoneFrame>
      <ResponsiveOptionSelect {...args} />
    </PhoneFrame>
  ),
  play: async ({ canvasElement }) => {
    if (!(await untilViewportBelow(768))) return;
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Sort options" }));
    const sheet = await within(document.body).findByRole("dialog");
    await expect(within(sheet).getByText("Sort")).toBeVisible();
    const group = within(sheet).getByRole("group", { name: "Sort" });
    const options = within(group).getAllByRole("button");
    await expect(options).toHaveLength(3);
    await expect(
      within(group).getByRole("button", { name: "Best" }),
    ).toHaveAttribute("aria-pressed", "true");
  },
};
