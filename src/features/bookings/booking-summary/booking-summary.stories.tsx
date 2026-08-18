import type { Meta, StoryObj } from "storybook-solidjs-vite";

import type { BookingQuotePreview } from "../view-models";
import { BookingSummary } from "./booking-summary";

function quote(priceCents: number, startUtc = "2026-07-01T07:00:00Z"): BookingQuotePreview {
  const platformFeeCents = Math.floor(priceCents / 10);
  return {
    allocation: {
      legs: [
        { recipientType: "host", shareBps: 9000, amountCents: priceCents - platformFeeCents, settlementStrategy: "operator_payout" },
        { recipientType: "platform_fee", shareBps: 1000, amountCents: platformFeeCents, settlementStrategy: "platform_fee_payout" },
      ],
    },
    expiresAtUtc: "2026-07-01T06:50:00Z",
    grossCents: priceCents,
    hostPayoutCents: priceCents - platformFeeCents,
    platformFeeCents,
    slot: {
      available: true,
      endUtc: "2026-07-01T07:30:00Z",
      priceCents,
      startUtc,
    },
  };
}

const meta = {
  title: "App/Bookings/BookingSummary",
  component: BookingSummary,
  args: {
    quote: quote(5000),
    viewerTimezone: "Europe/Vienna",
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof BookingSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <BookingSummary quote={quote(5000)} viewerTimezone="Europe/Vienna" />,
};

export const VariablePrice: Story = {
  render: () => <BookingSummary quote={quote(6000)} viewerTimezone="Europe/Vienna" />,
};

export const OddAmount: Story = {
  render: () => <BookingSummary quote={quote(3333)} viewerTimezone="Europe/Vienna" />,
};

export const ViewerInNewYork: Story = {
  render: () => <BookingSummary quote={quote(5000)} viewerTimezone="America/New_York" />,
};
