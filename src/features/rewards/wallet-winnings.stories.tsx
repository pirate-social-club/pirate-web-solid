import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type { RewardCredit } from "../../api/reward-claim.ts";
import { WalletWinnings } from "./wallet-winnings.tsx";

const credit = (id: string, amount: string, claim: RewardCredit["claim"], state: RewardCredit["state"] = "credited"): RewardCredit => ({
  object: "reward_credit", credit_id: id, payout_persona_id: "persona_harbor", chain_id: 84532,
  token_address: "0x1111111111111111111111111111111111111111", token_decimals: 6,
  amount_atomic: amount, available_atomic: amount, reserved_atomic: "0", paid_atomic: "0",
  source_kind: "megapot_allocation", state, created_at: "2026-09-25T00:00:00.000Z",
  updated_at: "2026-09-25T00:00:00.000Z", settled_at: null, claim, send: null,
});

const mixed: readonly RewardCredit[] = [
  credit("held", "150250000", { status: "unclaimed", payout_status: null }),
  credit("paying", "42000000", { status: "accepted", payout_status: "submitted" }, "payout_pending"),
  credit("sent", "12500000", { status: "accepted", payout_status: "confirmed" }, "sent"),
  credit("conflict", "8000000", { status: "subject_conflict", payout_status: null }),
];

function data(items: readonly RewardCredit[], failing = false) {
  return {
    credits: async () => {
      if (failing) throw new Error("unavailable");
      return { object: "reward_credit_list" as const, items: [...items], next_cursor: null };
    },
    claim: async (creditId: string) => ({
      outcome: "verification_missing" as const,
      credit: items.find((item) => item.credit_id === creditId)!,
    }),
  };
}

const meta = {
  title: "Parts/Wallet/Winnings",
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const States: Story = { render: () => <div class="p-5"><WalletWinnings data={data(mixed)} navigate={fn()} /></div> };
export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <div class="p-5"><WalletWinnings data={data(mixed)} navigate={fn()} /></div>,
};
export const RewardsUnavailable: Story = {
  render: () => <div class="p-5"><WalletWinnings data={data([], true)} navigate={fn()} /></div>,
  play: async ({ canvasElement }) => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await expect(canvasElement.textContent).toBe("");
  },
};
const navigate = fn();
export const VerifyToClaim: Story = {
  render: () => <div class="p-5"><WalletWinnings data={data(mixed)} navigate={navigate} /></div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("150.25 USDC")).toBeVisible();
    await expect(canvas.getByText("Sent to your wallet")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Verify to claim" }));
    await expect(navigate).toHaveBeenCalledWith(
      "/verify/very?purpose=reward_claim&return_to=%2Fwallet%3Fclaim%3Dheld",
    );
  },
};
