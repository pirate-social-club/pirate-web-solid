import { createRoot } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, expect, test, vi } from "vitest";
import type { RewardCredit } from "../../api/reward-claim.ts";
import { WalletWinnings } from "./wallet-winnings.tsx";

const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).forEach((dispose) => dispose()); document.body.replaceChildren(); });

const held: RewardCredit = {
  object: "reward_credit", credit_id: "credit_1", payout_persona_id: "persona_1", chain_id: 84532,
  token_address: "0x1111111111111111111111111111111111111111", token_decimals: 6,
  amount_atomic: "2000000", available_atomic: "2000000", reserved_atomic: "0", paid_atomic: "0",
  source_kind: "megapot_allocation", state: "credited", created_at: "2026-09-25T00:00:00.000Z",
  updated_at: "2026-09-25T00:00:00.000Z", settled_at: null, claim: { status: "unclaimed", payout_status: null }, send: null,
};

function mount(props: Parameters<typeof WalletWinnings>[0]) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  createRoot((dispose) => { disposers.push(dispose); render(() => <WalletWinnings {...props} />, element); });
  return element;
}

test("sends an unverified winner to the palm scan with a resume path", async () => {
  const navigate = vi.fn();
  const data = {
    credits: vi.fn(async () => ({ object: "reward_credit_list" as const, items: [held], next_cursor: null })),
    claim: vi.fn(async () => ({ outcome: "verification_missing" as const, credit: held })),
  };
  const element = mount({ data, navigate });
  await vi.waitFor(() => expect(element.textContent).toContain("2 USDC"));
  expect(element.textContent).toContain("Held for you");
  [...element.querySelectorAll("button")].find((button) => button.textContent === "Verify to claim")!.click();
  await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  const target = new URL(String(navigate.mock.calls[0]?.[0]), "https://app.pirate.test");
  expect(target.searchParams.get("purpose")).toBe("reward_claim");
  expect(target.searchParams.get("return_to")).toBe("/wallet?claim=credit_1");
});

test("resumes one claim after the palm scan and shows it as claimed", async () => {
  const navigate = vi.fn();
  const consumed = vi.fn();
  const claimed: RewardCredit = { ...held, state: "payout_reserved", claim: { status: "accepted", payout_status: "pending" } };
  const data = {
    credits: vi.fn(async () => ({ object: "reward_credit_list" as const, items: [held], next_cursor: null })),
    claim: vi.fn(async () => ({ outcome: "accepted" as const, credit: claimed })),
  };
  const element = mount({ data, navigate, resumeCreditId: "credit_1", onResumeConsumed: consumed });
  await vi.waitFor(() => expect(element.textContent).toContain("Sending to your wallet."));
  expect(data.claim).toHaveBeenCalledTimes(1);
  expect(data.claim).toHaveBeenCalledWith("credit_1");
  expect(consumed).toHaveBeenCalledTimes(1);
  expect(navigate).not.toHaveBeenCalled();
  expect(element.textContent).not.toContain("Verify to claim");
});

test("a resumed claim that still needs verification does not loop back to the scan", async () => {
  const navigate = vi.fn();
  const data = {
    credits: vi.fn(async () => ({ object: "reward_credit_list" as const, items: [held], next_cursor: null })),
    claim: vi.fn(async () => ({ outcome: "verification_stale" as const, credit: held })),
  };
  const element = mount({ data, navigate, resumeCreditId: "credit_1" });
  await vi.waitFor(() => expect(element.textContent).toContain("could not be used to claim yet"));
  expect(navigate).not.toHaveBeenCalled();
});

test("renders nothing while rewards are unavailable and skips a resumed claim", async () => {
  const data = {
    credits: vi.fn(async () => { throw new Error("provider_unavailable"); }),
    claim: vi.fn(),
  };
  const element = mount({ data, resumeCreditId: "credit_1" });
  await vi.waitFor(() => expect(data.credits).toHaveBeenCalled());
  await Promise.resolve();
  expect(element.textContent).toBe("");
  expect(data.claim).not.toHaveBeenCalled();
});

test("a permanent verification refusal points to support instead of the scan", async () => {
  const navigate = vi.fn();
  const data = {
    credits: vi.fn(async () => ({ object: "reward_credit_list" as const, items: [held], next_cursor: null })),
    claim: vi.fn(async () => ({ outcome: "verification_failed" as const, credit: held })),
  };
  const element = mount({ data, navigate });
  await vi.waitFor(() => expect(element.textContent).toContain("Held for you"));
  [...element.querySelectorAll("button")].find((button) => button.textContent === "Verify to claim")!.click();
  await vi.waitFor(() => expect(element.textContent).toContain("Contact support"));
  expect(navigate).not.toHaveBeenCalled();
});

test("shows nothing when the account has no pool winnings", async () => {
  const data = {
    credits: vi.fn(async () => ({ object: "reward_credit_list" as const, items: [{ ...held, source_kind: "asset_bonus" as const, claim: null }], next_cursor: null })),
    claim: vi.fn(),
  };
  const element = mount({ data });
  await vi.waitFor(() => expect(data.credits).toHaveBeenCalled());
  expect(element.textContent).toBe("");
});
