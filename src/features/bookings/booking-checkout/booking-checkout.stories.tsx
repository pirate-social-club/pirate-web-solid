import type { JSX } from "@solidjs/web";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { createSignal } from "solid-js";
import { Type } from "../../../design-system";

import type { BookingQuotePreview } from "../view-models";
import { BookingCheckout } from "./booking-checkout";

const quote: BookingQuotePreview = {
  allocation: {
    legs: [
      { recipientType: "host", shareBps: 9000, amountCents: 4500, settlementStrategy: "operator_payout" },
      { recipientType: "platform_fee", shareBps: 1000, amountCents: 500, settlementStrategy: "platform_fee_payout" },
    ],
  },
  expiresAtUtc: "2026-06-22T12:08:30Z",
  grossCents: 5000,
  hostPayoutCents: 4500,
  platformFeeCents: 500,
  slot: { available: true, endUtc: "2026-07-01T07:30:00Z", priceCents: 5000, startUtc: "2026-07-01T07:00:00Z" },
};

const meta = {
  title: "Compositions/Bookings/BookingCheckout",
  component: BookingCheckout,
  args: { quote, viewerTimezone: "Europe/Vienna", phase: "holding" as const, holdExpiresAtUtc: "2026-06-22T12:08:30Z", nowUtc: "2026-06-22T12:00:00Z" },
  parameters: { layout: "centered", a11y: { test: "error" } },
} satisfies Meta<typeof BookingCheckout>;

export default meta;
type Story = StoryObj<typeof meta>;

const frame = (story: JSX.Element): JSX.Element => <div class="w-full max-w-md">{story}</div>;
const common = { quote, viewerTimezone: "Europe/Vienna" as const, holdExpiresAtUtc: "2026-06-22T12:08:30Z", nowUtc: "2026-06-22T12:00:00Z" };
function InteractiveCheckout() {
  const [action, setAction] = createSignal("No checkout action yet.");
  return <div class="flex flex-col gap-3"><BookingCheckout {...common} onPay={() => setAction("pay")} onReleaseHold={() => setAction("release")} phase="holding" /><Type aria-live="polite" variant="caption">{action()}</Type></div>;
}

export const Holding: Story = { render: () => frame(<InteractiveCheckout />), play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByRole("button", { name: "Pay 50.00 USDC" })); await expect(canvas.getByText("pay")).toBeInTheDocument(); await userEvent.click(canvas.getByRole("button", { name: "Cancel" })); await expect(canvas.getByText("release")).toBeInTheDocument(); } };
export const HoldingLowTime: Story = { render: () => frame(<BookingCheckout {...common} phase="holding" holdExpiresAtUtc="2026-06-22T12:00:45Z" onPay={() => {}} />) };
export const Pending: Story = { render: () => frame(<BookingCheckout {...common} phase="pending" />) };
export const Conflict: Story = { render: () => frame(<BookingCheckout {...common} phase="conflict" onReleaseHold={() => {}} />) };
export const Mobile: Story = { render: () => <div class="mx-auto w-full max-w-sm"><BookingCheckout {...common} phase="holding" onPay={() => {}} /></div> };
