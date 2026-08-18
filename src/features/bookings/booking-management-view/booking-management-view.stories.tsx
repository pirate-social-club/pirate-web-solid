import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { createSignal } from "solid-js";
import { Type } from "../../../design-system";

import { BookingManagementView, type BookingManagementItem } from "./booking-management-view";

const items: BookingManagementItem[] = [
  { id: "live", counterpartyName: "Amira Hassan", counterpartyHandle: "amira.pirate", sessionTimeLabel: "6–6:30 PM, July 10", amountLabel: "50.00 USDC", statusLabel: "In progress", statusDetail: "Amira has started the session.", statusTone: "success", section: "upcoming", joinState: "live", canAddToCalendar: true },
  { id: "confirmed", counterpartyName: "Daniel Wu", counterpartyHandle: "daniel.eth", sessionTimeLabel: "10:30–11:15 AM, July 11", amountLabel: "72.00 USDC", statusLabel: "Confirmed", statusDetail: "Your session is booked.", statusTone: "success", section: "upcoming", joinState: "unavailable", joinAvailabilityLabel: "Join opens 5 minutes before the session.", canAddToCalendar: true, canCancel: true },
  { id: "review", counterpartyName: "Sofia Marin", counterpartyHandle: "sofia.pirate", sessionTimeLabel: "2–3 PM, July 8", amountLabel: "90.00 USDC", statusLabel: "Attendance under review", statusDetail: "No payment will move until the outcome is confirmed.", statusTone: "warning", section: "review" },
  { id: "complete", counterpartyName: "Mateo Silva", counterpartyHandle: "mateo.pirate", sessionTimeLabel: "4–4:30 PM, July 5", amountLabel: "45.00 USDC", statusLabel: "Completed", statusDetail: "Host payout completed.", statusTone: "muted", section: "past" },
  { id: "cancelled", counterpartyName: "Nora Ibrahim", counterpartyHandle: "nora.eth", sessionTimeLabel: "7–7:30 PM, July 3", amountLabel: "50.00 USDC", statusLabel: "Cancelled — no refund", statusDetail: "The free-cancellation window had ended.", statusTone: "muted", section: "cancelled" },
];

const meta = { title: "Compositions/Bookings/BookingManagementView", component: BookingManagementView, parameters: { layout: "fullscreen", a11y: { test: "error" } } } satisfies Meta<typeof BookingManagementView>;
export default meta;
type Story = StoryObj<typeof meta>;
const args = { onAddToCalendar: () => {}, onCancel: () => {}, onJoin: () => {}, onRetry: () => {}, onRoleChange: () => {}, onSignIn: () => {}, role: "booker" as const };
const hostItems = items.map((item) => item.id === "complete" ? { ...item, statusDetail: "Your payout completed." } : item);

function InteractiveManagement(props: { items?: BookingManagementItem[]; state: "ready" | "loading" | "empty" | "error" | "signed-out"; errorMessage?: string }) {
  const [role, setRole] = createSignal<"host" | "booker">("booker");
  const [action, setAction] = createSignal("No booking action yet.");
  return <div class="flex flex-col gap-3"><BookingManagementView errorMessage={props.errorMessage} items={props.items} onAddToCalendar={(item) => setAction(`calendar:${item.id}`)} onCancel={(item) => setAction(`cancel:${item.id}`)} onJoin={(item) => setAction(`join:${item.id}`)} onRetry={() => setAction("retry")} onRoleChange={setRole} onSignIn={() => setAction("sign-in")} role={role()} state={props.state} /><Type aria-live="polite" variant="caption">{action()}</Type></div>;
}

export const Booker: Story = { args: { ...args, items, state: "ready" }, render: () => <InteractiveManagement items={items} state="ready" />, play: async ({ canvasElement }) => { const canvas = within(canvasElement); const host = canvas.getByRole("button", { name: "As host" }); await userEvent.click(host); await expect(host).toHaveAttribute("aria-pressed", "true"); await userEvent.click(canvas.getByRole("button", { name: "Rejoin session" })); await expect(canvas.getByText("join:live")).toBeInTheDocument(); await userEvent.click(canvas.getAllByRole("button", { name: "Add to calendar" })[0]!); await expect(canvas.getByText("calendar:live")).toBeInTheDocument(); await userEvent.click(canvas.getByRole("button", { name: "Cancel booking" })); await expect(canvas.getByText("cancel:confirmed")).toBeInTheDocument(); } };
export const Host: Story = { args: { ...args, items: hostItems, role: "host", state: "ready" } };
const terminalItems: BookingManagementItem[] = [
  { ...items[3]!, id: "completed_paid", counterpartyName: "Mateo Silva", statusLabel: "Completed", statusDetail: "Host payout completed.", statusTone: "muted" },
  { ...items[3]!, id: "host_no_show", counterpartyName: "Ravi Kapoor", statusLabel: "Host missed the session", statusDetail: "Your full refund completed.", statusTone: "warning" },
  { ...items[3]!, id: "booker_no_show", counterpartyName: "Elena Petrova", statusLabel: "Booker missed the session", statusDetail: "The host payout completed under the attendance policy.", statusTone: "warning" },
  { ...items[4]!, id: "host_cancelled", counterpartyName: "Jon Bell", statusLabel: "Cancelled by host", statusDetail: "Your full refund completed." },
  { ...items[4]!, id: "booker_cancelled_refunded", counterpartyName: "Lina Park", statusLabel: "Cancelled — refunded", statusDetail: "Your full refund completed." },
  { ...items[2]!, id: "completed_unconfirmed", counterpartyName: "Ada Morgan", statusLabel: "Completed — payout pending", statusDetail: "Attendance review is complete and payout is queued.", statusTone: "warning", section: "review" },
];
export const TerminalOutcomes: Story = { args: { ...args, items: terminalItems, state: "ready" } };
export const Loading: Story = { args: { ...args, state: "loading" } };
export const Empty: Story = { args: { ...args, state: "empty" } };
export const Failure: Story = { args: { ...args, state: "error", errorMessage: "The connection timed out." }, render: () => <InteractiveManagement state="error" errorMessage="The connection timed out." />, play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByRole("button", { name: "Try again" })); await expect(canvas.getByText("retry")).toBeInTheDocument(); } };
export const SignedOut: Story = { args: { ...args, state: "signed-out" }, render: () => <InteractiveManagement state="signed-out" />, play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByRole("button", { name: "Sign in" })); await expect(canvas.getByText("sign-in")).toBeInTheDocument(); } };
export const Mobile: Story = { args: { ...args, items, state: "ready" }, globals: { direction: "rtl" }, parameters: { viewport: { defaultViewport: "mobile1" } } };
