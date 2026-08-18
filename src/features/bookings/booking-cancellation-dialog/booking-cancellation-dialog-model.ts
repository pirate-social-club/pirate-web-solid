import { formatCentsAsUsdc } from "../booking-format";
import type { BookingCancellationPreview } from "../view-models";

export interface BookingCancellationDialogCopy {
  title: string;
  sessionWith: string;
  termsChanged: string;
  termsChangedDetail: string;
  sessionTotal: string;
  refund: string;
  fullRefund: string;
  refundBack: string;
  noRefund: string;
  acknowledgement: string;
  cutoffEnded: string;
  genericError: string;
  keepBooking: string;
  confirm: string;
}

export const defaultBookingCancellationDialogCopy: BookingCancellationDialogCopy = {
  title: "Cancel booking?",
  sessionWith: "{time} with {name}",
  termsChanged: "Refund terms changed",
  termsChangedDetail: "Review the updated amount before cancelling.",
  sessionTotal: "Session total",
  refund: "Refund",
  fullRefund: "{name} receives a full refund.",
  refundBack: "You receive {amount} back.",
  noRefund: "This cancellation is not refundable.",
  acknowledgement: "I understand I will not receive a refund.",
  cutoffEnded: "The free-cancellation window ended {time}.",
  genericError: "The booking could not be cancelled. Try again.",
  keepBooking: "Keep booking",
  confirm: "Confirm cancellation",
};

export function fillBookingCancellationCopy(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/gu, (_match, key: string) => values[key] ?? `{${key}}`);
}

export function cancellationRequiresAcknowledgement(preview: BookingCancellationPreview): boolean {
  return preview.cancelledBy === "booker" && preview.refundCents === 0;
}

export function getBookingCancellationRefundMessage(
  preview: BookingCancellationPreview,
  counterpartyName: string,
  copy: BookingCancellationDialogCopy = defaultBookingCancellationDialogCopy,
): string {
  return preview.cancelledBy === "host"
    ? fillBookingCancellationCopy(copy.fullRefund, { name: counterpartyName })
    : preview.refundCents > 0
      ? fillBookingCancellationCopy(copy.refundBack, { amount: formatCentsAsUsdc(preview.refundCents) })
      : copy.noRefund;
}

export function isCancellationConfirmDisabled(
  state: "ready" | "submitting" | "terms-changed" | "error" | undefined,
  preview: BookingCancellationPreview,
  acknowledged: boolean,
): boolean {
  return state === "submitting" || (cancellationRequiresAcknowledgement(preview) && !acknowledged);
}

export function getBookingCancellationErrorMessage(
  state: "ready" | "submitting" | "terms-changed" | "error" | undefined,
  errorMessage: string | undefined,
  copy: BookingCancellationDialogCopy = defaultBookingCancellationDialogCopy,
): string | undefined {
  return state === "error" ? errorMessage ?? copy.genericError : undefined;
}
