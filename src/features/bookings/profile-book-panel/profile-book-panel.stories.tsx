import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { createSignal } from "solid-js";
import { Type } from "../../../design-system";

import type { ResolvedSlot } from "../view-models";
import { ProfileBookPanel } from "./profile-book-panel";

const slots: ResolvedSlot[] = [
  { startUtc: "2026-09-21T09:00:00.000Z", endUtc: "2026-09-21T09:30:00.000Z", priceCents: 5000, available: true },
  { startUtc: "2026-09-21T10:00:00.000Z", endUtc: "2026-09-21T10:30:00.000Z", priceCents: 5000, available: true },
  { startUtc: "2026-09-22T14:00:00.000Z", endUtc: "2026-09-22T14:30:00.000Z", priceCents: 7500, available: true },
];
const meta = { title: "Compositions/Bookings/ProfileBookPanel", component: ProfileBookPanel, parameters: { layout: "padded", a11y: { test: "error" } } } satisfies Meta<typeof ProfileBookPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
const base = { viewerTimezone: "Europe/Vienna" as const };
export const OwnerNotConfigured: Story = { args: { ...base, mode: "owner", configured: false, basePriceCents: 0, slots: [], onEdit: () => {} } };
function InteractiveOwner() {
  const [action, setAction] = createSignal("No profile action yet.");
  return <div class="flex flex-col gap-3"><ProfileBookPanel {...base} basePriceCents={5000} configured onEdit={() => setAction("edit")} slots={slots} mode="owner" /><Type aria-live="polite" variant="caption">{action()}</Type></div>;
}
function InteractiveViewer() {
  const [action, setAction] = createSignal("No slot selected.");
  return <div class="flex flex-col gap-3"><ProfileBookPanel {...base} mode="viewer" onSelectSlot={(slot) => setAction(slot.startUtc)} slots={slots} startingPriceCents={5000} /><Type aria-live="polite" variant="caption">{action()}</Type></div>;
}
export const OwnerConfigured: Story = { args: { ...base, mode: "owner", configured: true, basePriceCents: 5000, slots, onEdit: () => {} }, render: () => <InteractiveOwner />, play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByRole("button", { name: "Edit schedule" })); await expect(canvas.getByText("edit")).toBeInTheDocument(); } };
export const ViewerWithAvailability: Story = { args: { ...base, mode: "viewer", startingPriceCents: 5000, slots, onSelectSlot: () => {} }, render: () => <InteractiveViewer />, play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByRole("button", { name: /11:00 AM/ })); await userEvent.click(canvas.getByRole("button", { name: "Continue" })); await expect(canvas.getByText("2026-09-21T09:00:00.000Z")).toBeInTheDocument(); } };
export const ViewerNoAvailability: Story = { args: { ...base, mode: "viewer", startingPriceCents: 5000, slots: [], onSelectSlot: () => {} } };
export const Mobile: Story = { args: { ...base, mode: "viewer", startingPriceCents: 5000, slots, onSelectSlot: () => {} }, parameters: { viewport: { defaultViewport: "mobile1" } } };
