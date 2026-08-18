import { Show, createMemo } from "solid-js";

import { Button, IconButton, IconWarningCircle, IconX, Spinner, Type, cn } from "../../../design-system";
import {
  attendanceNotice,
  type AttendanceReportingHealth,
  type BookingSessionControlsState,
} from "./booking-session-controls-model";

export interface BookingSessionControlsProps {
  state: BookingSessionControlsState;
  viewerRole: "host" | "booker";
  counterpartyName: string;
  attendanceHealth?: AttendanceReportingHealth;
  onLeave: () => void;
  onComplete?: () => void;
  onReviewAttendance?: () => void;
  copy?: Partial<BookingSessionControlsCopy>;
  class?: string;
}

interface BookingSessionControlsCopy {
  attendanceInterrupted: string;
  attendanceRetrying: string;
  degradedDetail: string;
  retryingDetail: string;
  sessionWith: string;
  paymentUnlocks: string;
  leave: string;
  sessionEnded: string;
  attendanceDetermines: string;
  finish: string;
  report: string;
  checking: string;
  checkingDetail: string;
  confirmed: string;
  confirmedDetail: string;
}

const defaultBookingSessionControlsCopy: BookingSessionControlsCopy = {
  attendanceInterrupted: "Attendance reporting interrupted", attendanceRetrying: "Reconnecting attendance reporting",
  degradedDetail: "Stay in the session while we retry. Your video call can continue.", retryingDetail: "Your presence is being retried automatically.",
  sessionWith: "Session with {name}", paymentUnlocks: "Payment actions unlock after the scheduled session ends.", leave: "Leave session",
  sessionEnded: "Scheduled session ended", attendanceDetermines: "Attendance records determine the payout or refund.",
  finish: "Finish session", report: "Report attendance issue", checking: "Checking attendance", checkingDetail: "Keep this page open while the outcome is confirmed.",
  confirmed: "Session outcome confirmed", confirmedDetail: "The final payment status is available in your bookings.",
};

export function BookingSessionControls(props: BookingSessionControlsProps) {
  const copy = createMemo(() => ({ ...defaultBookingSessionControlsCopy, ...props.copy }));
  const notice = () => attendanceNotice(props.attendanceHealth ?? "healthy");
  return (
    <section class={cn("flex flex-col gap-4", props.class)} data-session-state={props.state}>
      <Show when={notice()}>
        {(value) => <div class={cn("flex flex-col gap-1 rounded-[var(--radius-lg)] border p-4", value().tone === "destructive" ? "border-destructive/40 bg-destructive/10" : "border-warning/40 bg-warning/10")} data-attendance-health={props.attendanceHealth}><Type class={value().tone === "destructive" ? "text-destructive-text" : "text-warning"} variant="body-strong">{value().tone === "destructive" ? copy().attendanceInterrupted : copy().attendanceRetrying}</Type><Type class={value().tone === "destructive" ? "text-destructive-text" : "text-warning"} variant="caption">{value().tone === "destructive" ? copy().degradedDetail : copy().retryingDetail}</Type></div>}
      </Show>

      <Show when={props.state === "in-session"}>
        <div class="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-border-soft bg-card p-4">
          <div class="flex min-w-0 flex-col gap-1"><Type variant="body-strong">{copy().sessionWith.replace("{name}", props.counterpartyName)}</Type><Type variant="caption">{copy().paymentUnlocks}</Type></div>
          <IconButton aria-label={copy().leave} onClick={props.onLeave} title={copy().leave} variant="destructive"><IconX aria-hidden="true" class="size-5" /></IconButton>
        </div>
      </Show>
      <Show when={props.state === "ready-to-settle"}>
        <div class="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border-soft bg-card p-4">
          <div class="flex flex-col gap-1"><Type variant="body-strong">{copy().sessionEnded}</Type><Type variant="caption">{copy().attendanceDetermines}</Type></div>
          <div class="flex flex-col gap-2 sm:flex-row"><Show when={props.viewerRole === "host"}><Button class="sm:flex-1" onClick={props.onComplete}>{copy().finish}</Button></Show><Button class="sm:flex-1" onClick={props.onReviewAttendance} variant="outline">{copy().report}</Button></div>
        </div>
      </Show>
      <Show when={props.state === "settling"}>
        <div class="flex items-center gap-3 rounded-[var(--radius-lg)] border border-border-soft bg-card p-4"><Spinner class="size-5" /><div class="flex flex-col gap-1"><Type variant="body-strong">{copy().checking}</Type><Type variant="caption">{copy().checkingDetail}</Type></div></div>
      </Show>
      <Show when={props.state === "settled"}>
        <div class="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-success/40 bg-success/10 p-4"><IconWarningCircle aria-hidden="true" class="size-5 text-success" /><Type class="text-success" variant="body-strong">{copy().confirmed}</Type><Type class="text-success" variant="caption">{copy().confirmedDetail}</Type></div>
      </Show>
    </section>
  );
}
