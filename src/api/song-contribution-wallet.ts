import { getAddress } from "viem";
import { tokenTransfer, type RewardFeeEstimate, type RewardTokenTransfer, type RewardTransferWallet } from "./reward-wallet-session.ts";
import type { SongContributionApi, SongContributionReceipt } from "./song-contributions.ts";

export type ContributionCancellationReceipt = Awaited<ReturnType<SongContributionApi["cancellation"]>>;

function nonce(value: string): bigint {
  if (!/^(0|[1-9][0-9]{0,18})$/u.test(value)) throw new Error("contribution_instruction_mismatch");
  const result = BigInt(value);
  if (result >= 2n ** 63n) throw new Error("contribution_instruction_mismatch");
  return result;
}

/** Reconstruct the transfer and compare its bytes with the immutable receipt.
 * The provider never chooses another nonce, sender, chain or destination. */
export function contributionFundingTransfer(receipt: SongContributionReceipt): RewardTokenTransfer {
  const instruction = receipt.instruction;
  if (instruction.kind !== "erc20_transfer" || instruction.value_atomic !== "0" || instruction.amount_atomic !== receipt.reservation.amount_atomic) throw new Error("contribution_instruction_mismatch");
  const transfer: RewardTokenTransfer = Object.freeze({
    sender: instruction.from, token: instruction.to_token, recipient: instruction.recipient_custody,
    amountAtomic: instruction.amount_atomic, chainId: instruction.chain_id,
    walletIndex: instruction.wallet_index, nonce: nonce(instruction.nonce),
  });
  const transaction = tokenTransfer(transfer);
  if (transaction.data.toLowerCase() !== instruction.calldata.toLowerCase()) throw new Error("contribution_instruction_mismatch");
  return transfer;
}

export function contributionCancellationTransfer(original: SongContributionReceipt, preparation: ContributionCancellationReceipt): RewardTokenTransfer {
  const transfer = contributionFundingTransfer(original), instruction = original.instruction;
  if (preparation.contribution_id !== original.contribution_id || preparation.original_funding_instruction_hash !== instruction.instruction_hash || preparation.chain_id !== instruction.chain_id || getAddress(preparation.sender) !== getAddress(instruction.from) || getAddress(preparation.recipient) !== getAddress(instruction.from) || preparation.nonce !== instruction.nonce || preparation.value_atomic !== "0" || preparation.data !== "0x" || preparation.wallet_assignment_id !== instruction.wallet_assignment_id || preparation.wallet_index !== instruction.wallet_index) throw new Error("contribution_cancellation_mismatch");
  return Object.freeze({ ...transfer, allowReplacement: true });
}

/** Uses the ordinary short-lived wallet session. Constructing this adapter has
 * no provider effect; estimates and signing remain explicit controller actions. */
export function createSongContributionWallet(session: Pick<RewardTransferWallet, "estimateTransfer" | "sendTransfer" | "estimateCancellation" | "sendCancellation" | "dispose">) {
  return {
    async estimate(original: SongContributionReceipt, cancellation?: ContributionCancellationReceipt): Promise<RewardFeeEstimate> {
      return cancellation
        ? session.estimateCancellation(contributionCancellationTransfer(original, cancellation))
        : session.estimateTransfer(contributionFundingTransfer(original));
    },
    async send(original: SongContributionReceipt, fee: RewardFeeEstimate, beforeBroadcast: () => Promise<void>, cancellation?: ContributionCancellationReceipt): Promise<string> {
      return cancellation
        ? session.sendCancellation(contributionCancellationTransfer(original, cancellation), fee, beforeBroadcast)
        : session.sendTransfer(contributionFundingTransfer(original), fee, beforeBroadcast);
    },
    dispose: () => session.dispose(),
  };
}

export type SongContributionWallet = ReturnType<typeof createSongContributionWallet>;
