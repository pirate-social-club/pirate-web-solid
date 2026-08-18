import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { AddToCalendar } from "./add-to-calendar";

const meta = {
  title: "App/Bookings/AddToCalendar",
  component: AddToCalendar,
  args: {
    bookingTitle: "English Conversation Practice",
    hostName: "Amira Hassan",
    startUtc: "2026-07-01T07:00:00Z",
    endUtc: "2026-07-01T07:30:00Z",
    viewerTimezone: "Europe/Vienna",
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof AddToCalendar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <AddToCalendar
      bookingTitle="English Conversation Practice"
      hostName="Amira Hassan"
      startUtc="2026-07-01T07:00:00Z"
      endUtc="2026-07-01T07:30:00Z"
      viewerTimezone="Europe/Vienna"
    />
  ),
};
