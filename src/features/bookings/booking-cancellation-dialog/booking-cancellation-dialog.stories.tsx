import { createSignal, Show } from "solid-js";
import { Button } from "../../../design-system";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import type { BookingCancellationPreview } from "../view-models";
import { BookingCancellationDialog, type BookingCancellationDialogProps } from "./booking-cancellation-dialog";

const fullRefund: BookingCancellationPreview = {
  object: "booking_cancellation_preview",
  bookingId: "booking_01",
  cancelledBy: "booker",
  grossCents: 5000,
  refundCents: 5000,
  hostPayoutCents: 0,
  platformFeeCents: 0,
  previewedAt: "2026-07-10T10:00:00.000Z",
  policyCutoffAt: "2026-07-11T14:00:00.000Z",
};

const zeroRefund: BookingCancellationPreview = {
  ...fullRefund,
  refundCents: 0,
  hostPayoutCents: 4500,
  platformFeeCents: 500,
  previewedAt: "2026-07-12T15:00:00.000Z",
};

const hostCancellation: BookingCancellationPreview = {
  ...fullRefund,
  cancelledBy: "host",
  policyCutoffAt: null,
};

const meta = {
  title: "App/Bookings/BookingCancellationDialog",
  component: BookingCancellationDialog,
  args: {
    counterpartyName: "Amira Hassan",
    onConfirm: () => undefined,
    onOpenChange: () => undefined,
    open: true,
    preview: fullRefund,
    sessionTimeLabel: "Monday, July 13 at 6:00 PM",
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof BookingCancellationDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseProps = {
  counterpartyName: "Amira Hassan",
  policyCutoffLabel: "Sunday, July 12 at 6:00 PM",
  sessionTimeLabel: "Monday, July 13 at 6:00 PM",
} as const;

function DialogStory(props: Omit<BookingCancellationDialogProps, "open" | "onOpenChange" | "onConfirm">) {
  const [open, setOpen] = createSignal(true, { ownedWrite: true });
  return (
    <>
      <Show when={!open()}>
        <Button onClick={() => setOpen(true)}>Open cancellation review</Button>
      </Show>
      <BookingCancellationDialog
        {...props}
        onConfirm={() => undefined}
        onOpenChange={setOpen}
        open={open()}
      />
    </>
  );
}

export const BookerFullRefund: Story = {
  render: () => <DialogStory {...baseProps} preview={fullRefund} />,
};

export const BookerNoRefund: Story = {
  render: () => <DialogStory {...baseProps} preview={zeroRefund} />,
};

export const HostCancellation: Story = {
  render: () => <DialogStory {...baseProps} counterpartyName="Daniel Wu" preview={hostCancellation} />,
};

export const TermsChanged: Story = {
  render: () => <DialogStory {...baseProps} preview={zeroRefund} state="terms-changed" />,
};

export const Submitting: Story = {
  render: () => <DialogStory {...baseProps} preview={fullRefund} state="submitting" />,
};

export const Failure: Story = {
  render: () => (
    <DialogStory
      {...baseProps}
      errorMessage="The refund terms could not be confirmed. Review them again before cancelling."
      preview={fullRefund}
      state="error"
    />
  ),
};

export const LongCounterpartyName: Story = {
  render: () => (
    <DialogStory
      {...baseProps}
      counterpartyName="Alexandria Montgomery-Washington"
      preview={fullRefund}
    />
  ),
};
