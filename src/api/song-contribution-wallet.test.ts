import { expect, test, vi } from "vitest";
import { contributionFixtures as f } from "./song-contributions.fixture.ts";
import { contributionCancellationTransfer, contributionFundingTransfer, createSongContributionWallet } from "./song-contribution-wallet.ts";
import { tokenTransfer, type RewardTransferWallet } from "./reward-wallet-session.ts";

test("funding uses the receipt's exact chain, calldata, assignment and full reserved nonce", () => {
  const receipt = { ...f.receipt, instruction: { ...f.receipt.instruction, chain_id: 8453 as const, nonce: "9223372036854775807" } };
  const transfer = contributionFundingTransfer(receipt);
  expect(transfer).toMatchObject({ chainId: 8453, nonce: 9223372036854775807n, sender: receipt.instruction.from, walletIndex: receipt.instruction.wallet_index });
  expect(tokenTransfer(transfer)).toMatchObject({ chainId: "0x2105", nonce: "0x7fffffffffffffff", data: receipt.instruction.calldata });
});

test.each([
  { calldata: "0x" }, { amount_atomic: "3000000" }, { nonce: "9223372036854775808" },
  { nonce: "9007199254740993.0" }, { nonce: "07" },
  { recipient_custody: "0x4444444444444444444444444444444444444444" },
  { from: "invalid" },
])("a contradictory funding instruction is rejected before a provider", change => {
  expect(() => contributionFundingTransfer({ ...f.receipt, instruction: { ...f.receipt.instruction, ...change } })).toThrow();
});

test("cancellation preserves the original nonce, account and assignment", () => {
  const transfer = contributionCancellationTransfer(f.receipt, f.cancellation);
  expect(transfer).toEqual({ ...contributionFundingTransfer(f.receipt), allowReplacement: true });
});

test.each([
  { contribution_id: "other" }, { original_funding_instruction_hash: "f".repeat(64) },
  { chain_id: 8453 as const }, { sender: "0x4444444444444444444444444444444444444444" },
  { recipient: "0x4444444444444444444444444444444444444444" }, { nonce: "8" },
  { wallet_assignment_id: "different" }, { wallet_index: 1 },
])("a cancellation cannot change the original identity or transaction", change => {
  expect(() => contributionCancellationTransfer(f.receipt, { ...f.cancellation, ...change })).toThrow("contribution_cancellation_mismatch");
});

test("the adapter performs no implicit provider work and delegates only the bound instruction", async () => {
  const fee = { gasLimit: "21000", gasPriceAtomic: "2", executionFeeAtomic: "42000" };
  const session: RewardTransferWallet = {
    selectTestnetFor: vi.fn(async () => {}),
    estimateTransfer: vi.fn(async () => fee), sendTransfer: vi.fn(async (_tx, _fee, before) => { await before(); return f.observationRequest.transaction_hash; }),
    estimateCancellation: vi.fn(async () => fee), sendCancellation: vi.fn(async (_tx, _fee, before) => { await before(); return f.observationRequest.transaction_hash; }), dispose: vi.fn(),
  };
  const wallet = createSongContributionWallet(session), before = vi.fn(async () => {});
  expect(session.estimateTransfer).not.toHaveBeenCalled(); expect(session.sendTransfer).not.toHaveBeenCalled();
  expect(await wallet.estimate(f.receipt)).toEqual(fee);
  expect(await wallet.send(f.receipt, fee, before)).toBe(f.observationRequest.transaction_hash);
  expect(session.sendTransfer).toHaveBeenCalledWith(contributionFundingTransfer(f.receipt), fee, before);
  await wallet.estimate(f.receipt, f.cancellation); await wallet.send(f.receipt, fee, before, f.cancellation);
  expect(session.sendCancellation).toHaveBeenCalledWith(contributionCancellationTransfer(f.receipt, f.cancellation), fee, before);
  expect(before).toHaveBeenCalledTimes(2);
});
