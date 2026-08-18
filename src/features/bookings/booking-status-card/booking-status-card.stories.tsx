import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import type { BookingState } from "../view-models";
import { BookingStatusCard } from "./booking-status-card";

const meta = {
  title: "App/Bookings/BookingStatusCard",
  component: BookingStatusCard,
  args: {
    canJoinSession: false,
    endUtc: "2026-07-01T07:30:00Z",
    hostName: "Amira Hassan",
    priceCents: 5000,
    startUtc: "2026-07-01T07:00:00Z",
    state: "confirmed",
    viewerTimezone: "Europe/Vienna",
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof BookingStatusCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseArgs = {
  endUtc: "2026-07-01T07:30:00Z",
  hostName: "Amira Hassan",
  priceCents: 5000,
  startUtc: "2026-07-01T07:00:00Z",
  viewerTimezone: "Europe/Vienna",
};

const matrixStates: BookingState[] = [
  "hold",
  "quoted",
  "settled",
  "expired_hold",
  "cancelled_before_payment",
  "cancelled_by_host",
  "cancelled_by_booker",
  "no_show_host",
  "no_show_booker",
  "refunded",
  "disputed",
];

export const Confirmed: Story = {
  render: () => (
    <BookingStatusCard {...baseArgs} canJoinSession state="confirmed" />
  ),
};

export const ConfirmedJoinDisabled: Story = {
  render: () => (
    <BookingStatusCard
      {...baseArgs}
      canJoinSession={false}
      joinDisabledReason="Session opens 5 minutes before start."
      state="confirmed"
    />
  ),
};

export const Live: Story = {
  render: () => (
    <BookingStatusCard {...baseArgs} canJoinSession state="live" />
  ),
};

export const PendingPayment: Story = {
  render: () => (
    <BookingStatusCard {...baseArgs} canJoinSession={false} state="pending_payment" />
  ),
};

export const Completed: Story = {
  render: () => (
    <BookingStatusCard {...baseArgs} canJoinSession={false} state="completed" />
  ),
};

export const StateMatrix: Story = {
  render: () => (
    <div class="grid max-w-6xl gap-4 md:grid-cols-2 xl:grid-cols-3">
      <For each={matrixStates}>
        {(state) => <BookingStatusCard {...baseArgs} canJoinSession={false} state={state} />}
      </For>
    </div>
  ),
};
