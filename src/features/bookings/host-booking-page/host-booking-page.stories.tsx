import type { JSX } from "@solidjs/web";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { createSignal } from "solid-js";
import { Type } from "../../../design-system";

import { HostBookingPage } from "./host-booking-page";

const profile = { name: "Amira Hassan", bio: "I help teams make complex product decisions with clarity and care.", topics: ["Product strategy", "Research", "Web3"], photoSrc: null, basePriceCents: 5000 };
const preview = (text: string) => <div class="rounded-[var(--radius-lg)] border border-border-soft bg-card p-4 text-center"><Type variant="caption">{text}</Type></div>;
const meta = { title: "Compositions/Bookings/HostBookingPage", component: HostBookingPage, args: profile, parameters: { layout: "fullscreen", a11y: { test: "error" } } } satisfies Meta<typeof HostBookingPage>;
export default meta;
type Story = StoryObj<typeof meta>;
const frame = (children: JSX.Element): JSX.Element => <div class="mx-auto w-full max-w-2xl p-4">{children}</div>;
const withVideoProfile = { ...profile, introVideoSrc: "data:video/mp4;base64,AAAA" };
function InteractiveHostBooking() {
  const [action, setAction] = createSignal("No host action yet.");
  return <div class="flex flex-col gap-3"><HostBookingPage {...withVideoProfile} availabilityPreview={preview("Availability preview — see calendar below")} onBookSession={() => setAction("book")} /><Type aria-live="polite" variant="caption">{action()}</Type></div>;
}
export const WithAvailability: Story = { render: () => frame(<InteractiveHostBooking />), play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByRole("button", { name: "Book a session" })); await expect(canvas.getByText("book")).toBeInTheDocument(); } };
export const WithoutIntroVideo: Story = { render: () => frame(<HostBookingPage {...profile} topics={profile.topics.slice(0, 2)} onBookSession={() => {}} />) };
export const EmptyAvailability: Story = { render: () => frame(<HostBookingPage {...profile} availabilityPreview={preview("No open slots in the next week.")} />) };
export const Mobile: Story = { render: () => <div class="mx-auto w-full max-w-sm p-4"><HostBookingPage {...profile} onBookSession={() => {}} /></div> };
