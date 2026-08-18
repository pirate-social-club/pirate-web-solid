import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { createSignal } from "solid-js";
import { Type } from "../../../design-system";

import { BookingSessionControls } from "./booking-session-controls";

const meta = {
  title: "Compositions/Bookings/BookingSessionControls",
  component: BookingSessionControls,
  args: { counterpartyName: "Amira Hassan", onComplete: () => {}, onLeave: () => {}, onReviewAttendance: () => {}, viewerRole: "host" as const },
  decorators: [(Story) => <div class="mx-auto w-full max-w-2xl p-4"><Story /></div>],
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof BookingSessionControls>;
export default meta;
type Story = StoryObj<typeof meta>;

function InteractiveSession(props: { state: "in-session" | "ready-to-settle" | "settling" | "settled"; viewerRole: "host" | "booker"; attendanceHealth?: "healthy" | "retrying" | "degraded" }) {
  const [action, setAction] = createSignal("No session action yet.");
  return <div class="flex flex-col gap-3"><BookingSessionControls attendanceHealth={props.attendanceHealth} counterpartyName="Amira Hassan" onComplete={() => setAction("finish")} onLeave={() => setAction("leave")} onReviewAttendance={() => setAction("report")} state={props.state} viewerRole={props.viewerRole} /><Type aria-live="polite" variant="caption">{action()}</Type></div>;
}

export const InSession: Story = { args: { state: "in-session" }, render: () => <InteractiveSession state="in-session" viewerRole="host" />, play: async ({ canvasElement }) => { const canvas = within(canvasElement); const leave = canvas.getByRole("button", { name: "Leave session" }); await userEvent.click(leave); await expect(canvas.getByText("leave")).toBeInTheDocument(); } };
export const AttendanceRetrying: Story = { args: { attendanceHealth: "retrying", state: "in-session" } };
export const AttendanceDegraded: Story = { args: { attendanceHealth: "degraded", state: "in-session" } };
export const HostAfterSession: Story = { args: { state: "ready-to-settle", viewerRole: "host" }, render: () => <InteractiveSession state="ready-to-settle" viewerRole="host" />, play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByRole("button", { name: "Finish session" })); await expect(canvas.getByText("finish")).toBeInTheDocument(); await userEvent.click(canvas.getByRole("button", { name: "Report attendance issue" })); await expect(canvas.getByText("report")).toBeInTheDocument(); } };
export const BookerAfterSession: Story = { args: { state: "ready-to-settle", viewerRole: "booker" } };
export const CheckingAttendance: Story = { args: { state: "settling" } };
export const OutcomeConfirmed: Story = { args: { state: "settled" } };
export const MobileDegraded: Story = { args: { attendanceHealth: "degraded", state: "in-session" }, parameters: { viewport: { defaultViewport: "mobile1" } } };
export const MobileAfterSession: Story = { args: { state: "ready-to-settle", viewerRole: "host" }, parameters: { viewport: { defaultViewport: "mobile1" } } };
