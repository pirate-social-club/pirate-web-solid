/** @jsxImportSource @solidjs/web */

import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { createSignal } from "solid-js";

import {
  ProfileBookingsSection,
  type ProfileBookingsSectionProps,
} from "./profile-bookings-section";
import type {
  AvailabilityExceptionDraft,
  AvailabilityRuleDraft,
  PriceRuleDraft,
  ProfileBookingsValues,
} from "./profile-bookings-section-model";

const timezoneOptions = ["UTC", "Europe/Vienna", "America/New_York", "Asia/Tokyo"];

const EMPTY_VALUES: ProfileBookingsValues = {
  timezone: "Europe/Vienna",
  durationSeconds: 1800,
  priceUsd: "",
};

const CONFIGURED_VALUES: ProfileBookingsValues = {
  timezone: "Europe/Vienna",
  durationSeconds: 1800,
  priceUsd: "50.00",
};

const WEEKLY_RULES: AvailabilityRuleDraft[] = [
  { id: "bar_1", byWeekday: [1, 2, 3, 4, 5], startLocal: "09:00", endLocal: "17:00", slotDurationMinutes: 30 },
  { id: "bar_2", byWeekday: [6], startLocal: "10:00", endLocal: "13:00", slotDurationMinutes: 30 },
];

const PRICE_RULES: PriceRuleDraft[] = [
  { id: "bprl_1", matchWeekday: [6], startLocal: "10:00", endLocal: "13:00", priceCents: 7500 },
];

const EXCEPTIONS: AvailabilityExceptionDraft[] = [
  { id: "bae_1", kind: "block", startUtc: new Date(1790000000 * 1000).toISOString(), endUtc: new Date(1790086400 * 1000).toISOString() },
];

function InteractiveProfileBookings(
  props: Partial<ProfileBookingsSectionProps> & { initialValues: ProfileBookingsValues },
) {
  const [values, setValues] = createSignal(props.initialValues);
  const [rules, setRules] = createSignal(props.rules ?? []);
  const [priceRules, setPriceRules] = createSignal(props.priceRules ?? []);
  const [exceptions, setExceptions] = createSignal(props.exceptions ?? []);
  const [bookable, setBookable] = createSignal(props.bookable ?? false);
  return (
    <div class="mx-auto max-w-2xl p-6">
      <ProfileBookingsSection
        {...props}
        bookable={bookable()}
        exceptions={exceptions()}
        onExceptionsChange={setExceptions}
        onPriceRulesChange={setPriceRules}
        onRulesChange={setRules}
        onToggleBookable={() => setBookable((current) => !current)}
        onValuesChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
        payoutReady={props.payoutReady ?? true}
        priceRules={priceRules()}
        rules={rules()}
        timezoneOptions={props.timezoneOptions ?? timezoneOptions}
        values={values()}
      />
    </div>
  );
}

const meta = {
  title: "Compositions/Bookings/ProfileBookingsSection",
  component: ProfileBookingsSection,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof ProfileBookingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

const storyArgs: ProfileBookingsSectionProps = {
  values: CONFIGURED_VALUES,
  rules: [],
  priceRules: [],
  exceptions: [],
  bookable: false,
  payoutReady: true,
  timezoneOptions,
};

/** Brand-new profile: no price or recurring schedule has been configured. */
export const NotConfigured: Story = {
  args: storyArgs,
  render: () => <InteractiveProfileBookings initialValues={EMPTY_VALUES} />,
};

/** Payout gate: an app wallet is required before the profile can become bookable. */
export const NoAppWallet: Story = {
  args: storyArgs,
  render: () => (
    <InteractiveProfileBookings
      initialValues={CONFIGURED_VALUES}
      payoutReady={false}
      rules={WEEKLY_RULES}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bookable = canvas.getByRole("switch", { name: "Bookable" });
    await expect(bookable).toBeDisabled();
    await expect(canvas.getByText("Set up your app wallet to receive payouts.")).toBeInTheDocument();
  },
};

/** Published profile with weekday/weekend windows, variable pricing, and a block exception. */
export const PublishedWithAvailability: Story = {
  args: storyArgs,
  render: () => (
    <InteractiveProfileBookings
      bookable
      exceptions={EXCEPTIONS}
      initialValues={CONFIGURED_VALUES}
      priceRules={PRICE_RULES}
      rules={WEEKLY_RULES}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const timezone = canvas.getByRole("combobox", { name: "Timezone" });
    await userEvent.selectOptions(timezone, "UTC");
    await expect(timezone).toHaveValue("UTC");
    await userEvent.tab();
    await expect(canvas.getByRole("combobox", { name: "Session length" })).toHaveFocus();
    await userEvent.click(canvas.getByRole("switch", { name: "Bookable" }));
    await expect(canvas.getByRole("switch", { name: "Bookable" })).not.toBeChecked();
    await userEvent.click(canvas.getByRole("switch", { name: "Bookable" }));
    await expect(canvas.getByRole("switch", { name: "Bookable" })).toBeChecked();
    await expect(canvas.getByText(/Sat · 10:00–13:00 · \$75\.00/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Remove bar_1" }));
    await expect(canvas.queryByRole("button", { name: "Remove bar_1" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getAllByRole("button", { name: "Add" })[0]!);
    await expect(canvas.getByRole("button", { name: "Remove rule-101" })).toBeInTheDocument();
    await userEvent.click(canvas.getAllByRole("button", { name: "Add" })[1]!);
    await expect(canvas.getByRole("button", { name: "Remove price-102" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Remove price-102" }));
    await userEvent.click(canvas.getByRole("button", { name: "Remove bae_1" }));
    const exceptionStart = canvas.getByLabelText("One-off exceptions: start");
    const exceptionEnd = canvas.getByLabelText("One-off exceptions: end");
    await userEvent.clear(exceptionStart);
    await userEvent.type(exceptionStart, "2026-07-05T09:00");
    await userEvent.clear(exceptionEnd);
    await userEvent.type(exceptionEnd, "2026-07-05T10:00");
    await userEvent.click(canvas.getAllByRole("button", { name: "Add" })[2]!);
    await expect(canvas.getByRole("button", { name: "Remove exception-103" })).toBeInTheDocument();
  },
};

/** Published toggle without rules: the profile is on but remains invisible to bookers. */
export const PublishedWithoutAvailability: Story = {
  args: storyArgs,
  render: () => (
    <InteractiveProfileBookings
      bookable
      initialValues={CONFIGURED_VALUES}
    />
  ),
};

/** Narrow viewport: the controlled form remains keyboard and direction safe. */
export const Mobile: Story = {
  args: storyArgs,
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => (
    <InteractiveProfileBookings
      bookable
      initialValues={CONFIGURED_VALUES}
      priceRules={PRICE_RULES}
      rules={WEEKLY_RULES}
    />
  ),
};
