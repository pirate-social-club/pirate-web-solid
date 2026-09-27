import { expect, test } from "vitest";
import type { RewardCredit } from "../../api/reward-claim.ts";
import { claimStep, verifyToClaimUrl, winningViews } from "./winnings-model.ts";

const credit = (id: string, claim: RewardCredit["claim"], state: RewardCredit["state"] = "credited"): RewardCredit => ({
  object: "reward_credit",
  credit_id: id,
  payout_persona_id: "persona_1",
  chain_id: 84532,
  token_address: "0x1111111111111111111111111111111111111111",
  token_decimals: 6,
  amount_atomic: "1500000",
  available_atomic: "1500000",
  reserved_atomic: "0",
  paid_atomic: "0",
  source_kind: claim === null ? "asset_bonus" : "megapot_allocation",
  state,
  created_at: "2026-09-25T00:00:00.000Z",
  updated_at: "2026-09-25T00:00:00.000Z",
  settled_at: null,
  claim,
  send: null,
});

test("lists only claimable pool winnings with plain states and no projections", () => {
  const views = winningViews([
    credit("bonus", null),
    credit("held", { status: "unclaimed", payout_status: null }),
    credit("conflict", { status: "subject_conflict", payout_status: null }),
    credit("paying", { status: "accepted", payout_status: "submitted" }, "payout_pending"),
    credit("sent", { status: "accepted", payout_status: "confirmed" }, "sent"),
    credit("retry", { status: "accepted", payout_status: "failed_retrying" }, "reconciliation_required"),
  ]);
  expect(views.map((view) => [view.creditId, view.status, view.canClaim])).toEqual([
    ["held", "Held for you", true],
    ["conflict", "Held", false],
    ["paying", "Claimed", false],
    ["sent", "Sent to your wallet", false],
    ["retry", "Claimed", false],
  ]);
  expect(views[0]?.amount).toBe("1.5 USDC");
  expect(views.some((view) => /subject|payout|reconciliation/u.test(`${view.status} ${view.detail ?? ""}`))).toBe(false);
});

test("maps claim outcomes to the next step and builds a same-origin resume path", () => {
  expect(claimStep("accepted")).toEqual({ kind: "done" });
  expect(claimStep("verification_missing")).toEqual({ kind: "verify" });
  expect(claimStep("verification_stale")).toEqual({ kind: "verify" });
  expect(claimStep("verification_failed")).toEqual({ kind: "support" });
  expect(claimStep("subject_conflict")).toEqual({ kind: "held" });
  expect(claimStep("not_claimable")).toEqual({ kind: "unavailable" });
  const url = new URL(verifyToClaimUrl("credit 1"), "https://app.pirate.test");
  expect(url.pathname).toBe("/verify/very");
  expect(url.searchParams.get("purpose")).toBe("reward_claim");
  expect(url.searchParams.get("return_to")).toBe("/wallet?claim=credit%201");
});
