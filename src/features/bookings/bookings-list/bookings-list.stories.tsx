import type { JSX } from "@solidjs/web";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { createSignal } from "solid-js";
import { Type } from "../../../design-system";

import { BookingsList, type BookingListItem } from "./bookings-list";

const upcoming: BookingListItem[] = [
  { id: "upcoming-1", hostName: "Amira Hassan", hostPhotoSrc: null, startUtc: "2026-07-01T07:00:00Z", endUtc: "2026-07-01T07:30:00Z", state: "confirmed", priceCents: 5000 },
  { id: "upcoming-2", hostName: "Daniel Wu", hostPhotoSrc: null, startUtc: "2026-07-02T14:00:00Z", endUtc: "2026-07-02T14:45:00Z", state: "live", priceCents: 7200 },
];
const past: BookingListItem[] = [{ id: "past-1", hostName: "Sofia Marin", hostPhotoSrc: null, startUtc: "2026-06-10T07:00:00Z", endUtc: "2026-06-10T07:30:00Z", state: "completed", priceCents: 9000 }];
const cancelled: BookingListItem[] = [{ id: "cancelled-1", hostName: "Nora Ibrahim", hostPhotoSrc: null, startUtc: "2026-06-03T07:00:00Z", endUtc: "2026-06-03T07:30:00Z", state: "cancelled_by_booker", priceCents: 5000 }];

const meta = { title: "Compositions/Bookings/BookingsList", component: BookingsList, args: { items: [], viewerTimezone: "Europe/Vienna" }, parameters: { layout: "fullscreen", a11y: { test: "error" } } } satisfies Meta<typeof BookingsList>;
export default meta;
type Story = StoryObj<typeof meta>;
const frame = (items: BookingListItem[]): JSX.Element => <div class="mx-auto w-full max-w-2xl p-4"><BookingsList items={items} viewerTimezone="Europe/Vienna" onSelectBooking={() => {}} /></div>;
function InteractiveList() {
  const [selected, setSelected] = createSignal("No booking selected.");
  return <div class="flex flex-col gap-3"><BookingsList items={upcoming} onSelectBooking={(item) => setSelected(item.id)} viewerTimezone="Europe/Vienna" /><Type aria-live="polite" variant="caption">{selected()}</Type></div>;
}
export const Upcoming: Story = { render: () => <div class="mx-auto w-full max-w-2xl p-4"><InteractiveList /></div>, play: async ({ canvasElement }) => { const canvas = within(canvasElement); const card = canvas.getByRole("button", { name: /Amira Hassan.*Confirmed/ }); await userEvent.click(card); await expect(canvas.getByText("upcoming-1")).toBeInTheDocument(); } };
export const Past: Story = { render: () => frame(past) };
export const Cancelled: Story = { render: () => frame(cancelled) };
export const Empty: Story = { render: () => frame([]) };
export const Mobile: Story = { render: () => <div class="mx-auto w-full max-w-sm p-4"><BookingsList items={upcoming} viewerTimezone="Europe/Vienna" /></div> };
