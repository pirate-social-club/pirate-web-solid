import { Show, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Button, Type } from "../../../design-system";
import type { ResolvedSlot } from "../view-models";
import { FeedBookingPanel, FeedBookingSheetBody } from "./feed-booking-sheet";

const slots: ResolvedSlot[] = [
  { startUtc: "2026-09-21T09:00:00.000Z", endUtc: "2026-09-21T09:30:00.000Z", priceCents: 3500, available: true },
  { startUtc: "2026-09-21T10:00:00.000Z", endUtc: "2026-09-21T10:30:00.000Z", priceCents: 3500, available: true },
  { startUtc: "2026-09-21T11:00:00.000Z", endUtc: "2026-09-21T11:30:00.000Z", priceCents: 3500, available: false },
  { startUtc: "2026-09-22T14:00:00.000Z", endUtc: "2026-09-22T14:30:00.000Z", priceCents: 5000, available: true },
];

const longSlots: ResolvedSlot[] = [21, 22, 23, 24].flatMap((day) =>
  [9, 10, 11, 14, 15, 16, 17].map((hour) => ({
    startUtc: `2026-09-${day}T${String(hour).padStart(2, "0")}:00:00.000Z`,
    endUtc: `2026-09-${day}T${String(hour).padStart(2, "0")}:30:00.000Z`,
    priceCents: 5000,
    available: true,
  })),
);

const meta = {
  title: "Compositions/Bookings/FeedBookingPanel",
  component: FeedBookingSheetBody,
  parameters: { layout: "centered" },
} satisfies Meta<typeof FeedBookingSheetBody>;

export default meta;
type Story = StoryObj<typeof meta>;

function InteractiveBooking(props: { slots: ResolvedSlot[]; loading?: boolean; error?: boolean; startingPriceCents?: number; panel?: boolean }) {
  const [selected, setSelected] = createSignal<string | undefined>();
  const [message, setMessage] = createSignal("Select a time to continue.");
  return (
    <div class="w-full max-w-2xl space-y-4 rounded-[var(--radius-lg)] bg-background p-5">
      <Show when={props.panel} fallback={
        <FeedBookingSheetBody
          error={props.error}
          loading={props.loading}
          onRetry={() => setMessage("Availability retry requested.")}
          onSelectSlot={(slot) => {
            setSelected(slot.startUtc);
            setMessage(`Selected ${slot.startUtc}`);
          }}
          slots={props.slots}
          startingPriceCents={props.startingPriceCents ?? 3500}
          viewerTimezone="Europe/Vienna"
        />
      }>
        <FeedBookingPanel
          error={props.error}
          handle="mara.english"
          loading={props.loading}
          onRetry={() => setMessage("Availability retry requested.")}
          onSelectSlot={(slot) => {
            setSelected(slot.startUtc);
            setMessage(`Selected ${slot.startUtc}`);
          }}
          slots={props.slots}
          startingPriceCents={props.startingPriceCents ?? 3500}
          viewerTimezone="Europe/Vienna"
        />
      </Show>
      <Type aria-live="polite" variant="caption">{selected() ? `${message()} — ready to confirm.` : message()}</Type>
    </div>
  );
}

export const Desktop: Story = {
  args: { slots, startingPriceCents: 3500, viewerTimezone: "Europe/Vienna" },
  globals: { viewport: { value: "desktop", isRotated: false } },
  render: () => <InteractiveBooking panel slots={slots} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "Book" });
    await expect(canvasElement.querySelector("[data-feed-panel-layout]")?.classList.contains("xl:grid-cols-[minmax(0,1fr)_26rem]")).toBe(false);
    await expect(canvasElement.querySelector("[data-feed-side-panel]")).not.toBeInTheDocument();
    await userEvent.click(trigger);
    await expect(canvas.getByRole("region", { name: "Booking availability" })).toBeVisible();
    await expect(canvasElement.querySelector("[data-feed-panel-layout]")?.classList.contains("xl:grid-cols-[minmax(0,1fr)_26rem]")).toBe(true);
    await userEvent.click(canvas.getByRole("button", { name: "Close booking" }));
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toHaveFocus();
  },
};

export const Mobile: Story = {
  args: { slots, startingPriceCents: 3500, viewerTimezone: "Europe/Vienna" },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <InteractiveBooking panel slots={slots} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const trigger = canvas.getByRole("button", { name: "Book" });
    await userEvent.click(trigger);
    await expect(body.getByRole("region", { name: "Booking availability" })).toBeVisible();
    await userEvent.click(body.getByRole("button", { name: "Close booking" }));
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  },
};

export const LongAvailability: Story = {
  args: { slots: longSlots, startingPriceCents: 5000, viewerTimezone: "Europe/Vienna" },
  render: () => <InteractiveBooking slots={longSlots} startingPriceCents={5000} />,
};

export const Loading: Story = {
  args: { slots: [], loading: true, startingPriceCents: 3500, viewerTimezone: "Europe/Vienna" },
  render: () => <InteractiveBooking loading slots={[]} />,
};

export const NoAvailability: Story = {
  args: { slots: [], startingPriceCents: 3500, viewerTimezone: "Europe/Vienna" },
  render: () => <InteractiveBooking slots={[]} />,
};

export const AvailabilityError: Story = {
  args: { slots: [], error: true, startingPriceCents: 3500, viewerTimezone: "Europe/Vienna" },
  render: () => (
    <div class="space-y-3">
      <InteractiveBooking error slots={[]} />
      <Button aria-label="Retry availability" type="button">Retry is available</Button>
    </div>
  ),
};
