import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { SharedSongParticipationStatus, SharedSongParticipationView } from "./shared-song-participation.tsx";
import { sharedSongParticipationFixture } from "./shared-song-participation.fixtures.ts";

const meta = { title: "Parts/Rewards/Shared song participation", parameters: { layout: "fullscreen", a11y: { test: "error" } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const now = Date.parse("2099-10-22T12:00:00.000Z");
export const FundedSong: Story = {
  render: () => <main class="mx-auto max-w-xl p-4"><SharedSongParticipationView participation={sharedSongParticipationFixture()} now={now} /></main>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Funded requirements and budget"));
    await expect(canvas.getByText(/no numeric Dance score/)).toBeVisible();
    await expect(canvas.getByText(/Earlier practice cannot be upgraded/)).toBeVisible();
    await expect(canvas.getByText(/Drawing 201 · Not opened/)).toBeVisible();
  },
};
export const PreviousWinnings: Story = {
  render: () => {
    const value = sharedSongParticipationFixture(), first = value.drawings[0];
    if (first.kind !== "materialized") throw new Error("fixture drawing missing");
    return <main class="mx-auto max-w-xl p-4"><SharedSongParticipationView participation={{ ...value, drawings: [{ ...first,
      drawing: { ...first.drawing, state: "won", lifecycle_status: "credited", beneficiary_count: 10, net_winnings_atomic: "900000" },
      standing: { share_held: true, credit: { credit_id: "fictional-credit", amount_atomic: "90000", state: "credited", claim: { status: "unclaimed", payout_status: null } } },
    }, value.drawings[1]] }} now={now} /></main>;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Your confirmed allocation: 0.09 test USDC.")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Review winnings in Wallet" })).toHaveAttribute("href", "/wallet");
  },
};
export const RewardsOff: Story = {
  render: () => <main class="mx-auto max-w-xl p-4"><p>Activity complete.</p><SharedSongParticipationStatus communityId="test-community" postId="test-song" data={{ read: async () => { throw new Error("Rewards off"); } }} /></main>,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Activity complete.")).toBeVisible();
    await expect(canvasElement.querySelector("[data-shared-song-participation]")).toBeNull();
  },
};
