import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { fn } from "storybook/test";
import { paidWinning } from "./winnings-send.fixtures.ts";
import { sponsoredFixture, sponsoredFixtureRecord } from "./sponsored-send.fixtures.ts";
import { SponsoredSendSheet } from "./sponsored-send-sheet.tsx";

const meta = {
  title: "Parts/Wallet/Sponsored send",
  component: SponsoredSendSheet,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof SponsoredSendSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EnterDetails: Story = {
  args: { credit: paidWinning, dependencies: sponsoredFixture(), onClose: fn() },
};

export const AwaitingAuthorization: Story = {
  args: { credit: paidWinning, dependencies: sponsoredFixture(sponsoredFixtureRecord), onClose: fn() },
};

export const AwaitingNetwork: Story = {
  args: { credit: paidWinning, dependencies: sponsoredFixture({ ...sponsoredFixtureRecord, status: "submitted", authorization: null }), onClose: fn() },
};

export const Confirmed: Story = {
  args: {
    credit: paidWinning,
    dependencies: sponsoredFixture({
      ...sponsoredFixtureRecord, status: "confirmed", authorization: null,
      transaction_hash: `0x${"5e".repeat(32)}`,
    }),
    onClose: fn(),
  },
};
