import type { ParentProps } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import type { ResolvedSlot } from "../view-models";
import { AvailabilityCalendar } from "./availability-calendar";

const meta = {
  title: "App/Bookings/AvailabilityCalendar",
  component: AvailabilityCalendar,
  args: {
    slots: [],
    viewerTimezone: "Europe/Vienna",
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AvailabilityCalendar>;

export default meta;
type Story = StoryObj<typeof meta>;

function slot(startUtc: string, endUtc: string, priceCents = 5000, available = true): ResolvedSlot {
  return { available, endUtc, priceCents, startUtc };
}

const UNIFORM_WEEK: ResolvedSlot[] = [
  slot("2026-09-21T09:00:00.000Z", "2026-09-21T09:30:00.000Z"),
  slot("2026-09-21T10:00:00.000Z", "2026-09-21T10:30:00.000Z"),
  slot("2026-09-21T11:00:00.000Z", "2026-09-21T11:30:00.000Z", 5000, false),
  slot("2026-09-22T14:00:00.000Z", "2026-09-22T14:30:00.000Z"),
  slot("2026-09-22T15:00:00.000Z", "2026-09-22T15:30:00.000Z"),
  slot("2026-09-23T16:00:00.000Z", "2026-09-23T16:30:00.000Z"),
];

const MIXED_WEEK = UNIFORM_WEEK.map((current, index) => ({
  ...current,
  priceCents: index % 2 === 0 ? 3500 : 7500,
}));

const DAY_SWITCHING_WEEK = Array.from({ length: 7 }, (_, index) => {
  const day = String(21 + index).padStart(2, "0");
  return slot(`2026-09-${day}T09:00:00.000Z`, `2026-09-${day}T09:30:00.000Z`);
});

const DST_FALLBACK: ResolvedSlot[] = [
  slot("2026-10-25T00:30:00.000Z", "2026-10-25T01:00:00.000Z"),
  slot("2026-10-25T01:30:00.000Z", "2026-10-25T02:00:00.000Z"),
];

function DockFrame(props: ParentProps) {
  return <div class="mx-auto flex min-h-screen max-w-sm flex-col border border-border-soft bg-card p-4">{props.children}</div>;
}

const demoGetSlotHref = (current: ResolvedSlot) =>
  `/book/usr_host/checkout?start=${encodeURIComponent(current.startUtc)}`;

export const UniformSlotsNoCaptions: Story = {
  render: () => (
    <DockFrame>
      <AvailabilityCalendar
        getSlotHref={demoGetSlotHref}
        onSelectSlot={() => undefined}
        slots={UNIFORM_WEEK}
        viewerTimezone="Europe/Vienna"
      />
    </DockFrame>
  ),
};

export const MixedPricingCaptions: Story = {
  render: () => (
    <DockFrame>
      <AvailabilityCalendar
        getSlotHref={demoGetSlotHref}
        onSelectSlot={() => undefined}
        slots={MIXED_WEEK}
        viewerTimezone="Europe/Vienna"
      />
    </DockFrame>
  ),
};

export const SelectedConfirmFooter: Story = {
  render: () => (
    <DockFrame>
      <AvailabilityCalendar
        getSlotHref={demoGetSlotHref}
        onSelectSlot={() => undefined}
        selectedStartUtc="2026-09-21T10:00:00.000Z"
        slots={UNIFORM_WEEK}
        viewerTimezone="Europe/Vienna"
      />
    </DockFrame>
  ),
};

export const OwnerReadOnlyPreview: Story = {
  render: () => (
    <DockFrame>
      <AvailabilityCalendar slots={UNIFORM_WEEK} viewerTimezone="Europe/Vienna" />
    </DockFrame>
  ),
};

export const DaySwitching: Story = {
  render: () => (
    <DockFrame>
      <AvailabilityCalendar
        getSlotHref={demoGetSlotHref}
        onSelectSlot={() => undefined}
        slots={DAY_SWITCHING_WEEK}
        viewerTimezone="Europe/Vienna"
      />
    </DockFrame>
  ),
};

export const FallBackDstDisambiguation: Story = {
  render: () => (
    <DockFrame>
      <AvailabilityCalendar
        getSlotHref={demoGetSlotHref}
        onSelectSlot={() => undefined}
        slots={DST_FALLBACK}
        viewerTimezone="Europe/Vienna"
      />
    </DockFrame>
  ),
};

export const Empty: Story = {
  render: () => (
    <DockFrame>
      <AvailabilityCalendar slots={[]} viewerTimezone="Europe/Vienna" />
    </DockFrame>
  ),
};
