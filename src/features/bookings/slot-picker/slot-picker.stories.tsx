import { createSignal } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import type { ResolvedSlot } from "../view-models";
import { SlotPicker } from "./slot-picker";

const meta = {
  title: "App/Bookings/SlotPicker",
  component: SlotPicker,
  args: {
    slots: [],
    viewerTimezone: "Europe/Vienna",
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof SlotPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultSlots: ResolvedSlot[] = [
  { startUtc: "2026-07-01T07:00:00Z", endUtc: "2026-07-01T07:30:00Z", priceCents: 6000, available: true },
  { startUtc: "2026-07-01T07:30:00Z", endUtc: "2026-07-01T08:00:00Z", priceCents: 6000, available: true },
  { startUtc: "2026-07-01T08:00:00Z", endUtc: "2026-07-01T08:30:00Z", priceCents: 5000, available: true },
  { startUtc: "2026-07-01T08:30:00Z", endUtc: "2026-07-01T09:00:00Z", priceCents: 5000, available: true },
];

const conflictSlots: ResolvedSlot[] = defaultSlots.map((slot, index) =>
  index === 1 ? { ...slot, available: false } : slot,
);

export const Default: Story = {
  render: () => (
    <SlotPicker slots={defaultSlots} viewerTimezone="Europe/Vienna" />
  ),
};

export const WithConflict: Story = {
  name: "With unavailable slot",
  render: () => (
    <SlotPicker slots={conflictSlots} viewerTimezone="Europe/Vienna" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const options = canvas.getAllByRole("option");

    expect(canvas.getByRole("listbox", { name: "Available booking times" })).toBeInTheDocument();
    expect(options).toHaveLength(conflictSlots.length);
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toBeDisabled();

    await userEvent.click(options[0]!);
    expect(options[0]).toHaveFocus();
  },
};

export const ControlledSelection: Story = {
  render: () => {
    const [selectedStartUtc, setSelectedStartUtc] = createSignal(defaultSlots[0]?.startUtc);
    return (
      <SlotPicker
        slots={defaultSlots}
        viewerTimezone="Europe/Vienna"
        selectedStartUtc={selectedStartUtc()}
        onSelectSlot={(slot) => setSelectedStartUtc(slot.startUtc)}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const options = canvas.getAllByRole("option");

    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("tabindex", "0");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
    expect(within(options[0]!).getByText("30 min")).toHaveClass("text-primary-foreground");

    options[0]?.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(options[1]).toHaveFocus();
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
  },
};

export const Empty: Story = {
  render: () => <SlotPicker slots={[]} viewerTimezone="Europe/Vienna" />,
};
