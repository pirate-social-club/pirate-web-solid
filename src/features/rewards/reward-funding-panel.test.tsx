import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@solidjs/web";
import { createRoot } from "solid-js";
import { RewardFundingPanel } from "./reward-funding-panel.tsx";
import type { RewardFundingState } from "../../api/reward-funding-controller.ts";
const disposers: Array<() => void> = [];
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); });
function mount(state: RewardFundingState) {
  const root = document.createElement("div"); document.body.appendChild(root);
  const confirm = vi.fn(), refresh = vi.fn(), reconcile = vi.fn();
  createRoot(dispose => { disposers.push(dispose); render(() => <RewardFundingPanel state={state} personaLabel="Harbor persona" tokenSymbol="PSTB" busy={false} onConfirm={confirm} onRefresh={refresh} onReconcile={reconcile} />, root); });
  return { root, confirm, refresh, reconcile };
}
describe("funding approval and reconciliation", () => {
  it("renders the complete headless-wallet approval and requires an explicit click", () => {
    const { root, confirm } = mount({ kind: "review", review: { id: "review-id", fee: { gasLimit: "21000", gasPriceAtomic: "2000000000", executionFeeAtomic: "42000000000000" }, context: {
      actor: { accountId: "account", personaId: "persona" }, walletIndex: 0, funding: { object: "asset_bonus_funding", action: "fund_with_asset", funding_effect_id: "effect", leg_id: "leg", status: "planned", chain_id: 84532, token_address: `0x${"a".repeat(40)}`, token_decimals: 6, sender_address: `0x${"b".repeat(40)}`, recipient_address: `0x${"c".repeat(40)}`, expected_amount_atomic: "1000000", confirmed_amount_atomic: null, required_confirmations: 2, transaction_hash: null },
    } } });
    expect(root.textContent).toContain("Harbor persona"); expect(root.textContent).toContain("Base Sepolia");
    expect(root.textContent).toContain("1 PSTB"); expect(root.textContent).toContain("0.000042 ETH");
    for (const char of ["a","b","c"]) expect(root.textContent).toContain(`0x${char.repeat(40)}`);
    expect(confirm).not.toHaveBeenCalled(); root.querySelector<HTMLButtonElement>("button")!.click(); expect(confirm).toHaveBeenCalledWith("review-id");
  });
  it.each(["provider_rejected", "recovery_corrupt", "recovery_unavailable", "terms_changed", "transaction_mismatch"] as const)("keeps %s distinct and offers no resend", reason => {
    const { root, confirm } = mount({ kind: "reconciliation", reason, transactionHash: null });
    expect(root.querySelector('[role="alert"]')?.textContent).toBeTruthy();
    expect(root.textContent).not.toContain("Confirm transfer"); expect(root.textContent).not.toContain("Nothing was sent"); expect(confirm).not.toHaveBeenCalled();
  });
  it("does not claim an unknown-hash transfer was sent", () => {
    const { root } = mount({ kind: "uncertain", transactionHash: null });
    expect(root.textContent).toContain("may have sent"); expect(root.textContent).not.toContain("Funding confirmed");
  });
});
