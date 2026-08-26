import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { OptionCard, OptionCardGroup } from "./option-card";

function CadenceGroup(props: { disabled?: boolean; initial?: string }) {
  const [value, setValue] = createSignal(props.initial ?? "monthly");
  return (
    <div class="w-96">
      <OptionCardGroup label="Billing cadence" onChange={setValue} value={value()}>
        <OptionCard description="Billed every week." title="Weekly" value="weekly" />
        <OptionCard description="Billed every month." title="Monthly" value="monthly" />
        <OptionCard
          disabled={props.disabled}
          disabledHint={props.disabled ? "Not available in your region." : undefined}
          description="Billed once a year."
          title="Yearly"
          value="yearly"
        />
      </OptionCardGroup>
      <p class="sr-only">{`Selected ${value()}`}</p>
    </div>
  );
}

const meta = {
  title: "Patterns/Forms/OptionCard",
  component: OptionCard,
  tags: ["autodocs"],
  args: { title: "Monthly", description: "Billed every month.", value: "monthly" },
  argTypes: {
    class: { table: { disable: true } },
    icon: { table: { disable: true } },
  },
  render: () => <CadenceGroup />,
  parameters: {
    docs: {
      description: {
        component:
          "One choice inside an OptionCardGroup, drawn as a card with a selection dot, title, description, and optional leading icon. It composes Kobalte's RadioGroup item, so the group is a single tab stop and arrow keys move the selection. The group owns the selected value. Do not use it for multi-select.",
      },
    },
  },
} satisfies Meta<typeof OptionCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("radiogroup", { name: "Billing cadence" })).toBeInTheDocument();
    await expect(canvas.getByRole("radio", { name: /Monthly/ })).toBeChecked();

    await userEvent.click(canvas.getByRole("radio", { name: /Weekly/ }));
    await expect(canvas.getByText("Selected weekly")).toBeInTheDocument();
  },
};

/** The group is one tab stop and arrow keys move the selection. */
export const KeyboardNavigation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const checked = canvas.getByRole("radio", { name: /Monthly/ });

    await userEvent.tab();
    await expect(checked).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}");
    await expect(canvas.getByRole("radio", { name: /Yearly/ })).toBeChecked();
    await expect(canvas.getByText("Selected yearly")).toBeInTheDocument();

    await userEvent.keyboard("{ArrowUp}");
    await expect(canvas.getByRole("radio", { name: /Monthly/ })).toBeChecked();

    // Tab leaves the whole group rather than visiting each option.
    await userEvent.tab();
    await expect(canvas.queryByRole("radio", { name: /Weekly/ })).not.toHaveFocus();
    await expect(canvas.queryByRole("radio", { name: /Yearly/ })).not.toHaveFocus();
  },
};

export const Disabled: Story = {
  render: () => <CadenceGroup disabled />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("radio", { name: /Yearly/ })).toBeDisabled();
    await expect(canvas.getByText("Not available in your region.")).toBeInTheDocument();
  },
};
