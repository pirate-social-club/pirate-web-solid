import { formatUnits, getAddress, isAddress, parseUnits, zeroAddress } from "viem";
import type { RewardCredit } from "../../api/reward-claim.ts";
import type { GasTopup, WinnerSendRecord, WinningsSender } from "../../api/reward-winnings-send.ts";
import type { RewardTokenTransfer } from "../../api/reward-wallet-session.ts";

/** Only a claimed winning whose USDC reached the persona wallet can be sent on. */
export function canSendWinning(credit: RewardCredit): boolean {
  return credit.chain_id === 84532 && credit.claim?.status === "accepted" && credit.claim.payout_status === "confirmed";
}

export function explorerTransactionUrl(hash: string): string {
  return `https://sepolia.basescan.org/tx/${hash}`;
}

export type RecipientCheck = Readonly<{ ok: true; address: string }> | Readonly<{ ok: false; message: string }>;

/**
 * A 0x address with 40 hex digits. All-lowercase or all-uppercase hex carries
 * no checksum and is accepted; mixed case must match its EIP-55 checksum,
 * since a mismatch usually means a mistyped address. Never the sender itself
 * or the token contract.
 */
export function checkRecipient(input: string, sender: string, token: string): RecipientCheck {
  const value = input.trim();
  if (value.length === 0) return { ok: false, message: "Enter the address to send to." };
  if (!/^0x[0-9a-fA-F]{40}$/u.test(value) || !isAddress(value, { strict: false })) {
    return { ok: false, message: "Enter a valid address that starts with 0x." };
  }
  const digits = value.slice(2);
  const address = getAddress(value.toLowerCase());
  if (/[a-f]/u.test(digits) && /[A-F]/u.test(digits) && address !== `0x${digits}`) {
    return { ok: false, message: "This address does not match its capital letters. Copy it again from where you found it." };
  }
  if (address === zeroAddress) return { ok: false, message: "This address cannot receive USDC." };
  if (address === getAddress(sender.toLowerCase())) return { ok: false, message: "This is the wallet you are sending from. Enter a different address." };
  if (address === getAddress(token.toLowerCase())) return { ok: false, message: "This is the USDC contract, not a wallet. Sending to it would lose the USDC." };
  return { ok: true, address };
}

export type AmountCheck = Readonly<{ ok: true; atomic: bigint }> | Readonly<{ ok: false; message: string }>;

/** The most this sheet sends: the paid winnings, and never more than the wallet holds. */
export function sendableAtomic(credit: RewardCredit, balance: bigint | undefined): bigint {
  const paid = BigInt(credit.paid_atomic);
  return balance !== undefined && balance < paid ? balance : paid;
}

/** A positive USDC amount, never more than the sendable limit. */
export function checkAmount(input: string, decimals: number, limit: bigint): AmountCheck {
  const value = input.trim();
  const pattern = new RegExp(`^(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,${decimals}})?$`, "u");
  if (!pattern.test(value)) return { ok: false, message: `Enter an amount with up to ${decimals} decimal places.` };
  const atomic = parseUnits(value, decimals);
  if (atomic <= 0n) return { ok: false, message: "Enter an amount above zero." };
  if (atomic > limit) {
    return { ok: false, message: `You can send up to ${formatUnits(limit, decimals)} USDC from these winnings.` };
  }
  return { ok: true, atomic };
}

/** The paid winnings, lowered to the wallet balance when the wallet holds less. */
export function defaultAmount(credit: RewardCredit, balance: bigint | undefined): string {
  return formatUnits(sendableAtomic(credit, balance), credit.token_decimals);
}

export type GasWait = "confirmed" | "released" | "timeout";

export type GasPollOptions = Readonly<{
  intervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Stops polling early, for example when the sheet closes. */
  cancelled?: () => boolean;
}>;

const wait = (ms: number) => new Promise<void>(resolve => { setTimeout(resolve, ms); });

/**
 * Polls one top-up until the gas arrives or is released. A read failure counts
 * as another wait, since a transient error says nothing about the top-up.
 */
export async function waitForGasTopup(
  read: (topupId: string) => Promise<GasTopup>,
  topupId: string,
  options: GasPollOptions = {},
): Promise<GasWait> {
  const interval = options.intervalMs ?? 3_000;
  const attempts = Math.max(1, Math.ceil((options.timeoutMs ?? 120_000) / interval));
  const sleep = options.sleep ?? wait;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (options.cancelled?.()) return "timeout";
    try {
      const topup = await read(topupId);
      if (topup.status === "confirmed") return "confirmed";
      if (topup.status === "released") return "released";
    } catch { /* keep waiting */ }
    if (attempt + 1 < attempts) await sleep(interval);
  }
  return "timeout";
}

export function transferFor(credit: RewardCredit, sender: WinningsSender, recipient: string, atomic: bigint): RewardTokenTransfer {
  return { sender: sender.address, token: credit.token_address, recipient, amountAtomic: atomic.toString(), walletIndex: sender.walletIndex };
}

/** The API record is authoritative for every signed transaction. */
export function recordedTransfer(record: WinnerSendRecord, walletIndex: number, allowReplacement: boolean): RewardTokenTransfer {
  return {
    sender: record.sender, token: record.token_address, recipient: record.recipient,
    amountAtomic: record.amount_atomic, nonce: record.nonce, walletIndex, allowReplacement,
  };
}

export function recordMatches(record: WinnerSendRecord, transfer: RewardTokenTransfer, creditId: string): boolean {
  return record.credit_id === creditId && record.chain_id === 84532 &&
    getAddress(record.sender) === getAddress(transfer.sender) &&
    getAddress(record.token_address) === getAddress(transfer.token) &&
    getAddress(record.recipient) === getAddress(transfer.recipient) &&
    record.amount_atomic === transfer.amountAtomic && Number.isSafeInteger(record.nonce) && record.nonce >= 0;
}

/** A quarter above the highest known transaction clears the normal replacement bump. */
export function replacementFloor(previous: bigint): bigint {
  if (previous <= 0n) throw new Error("replacement_price_invalid");
  return (previous * 125n + 99n) / 100n;
}

export function canBroadcast(status: WinnerSendRecord["status"], action: "retry" | "replace" | "cancel"): boolean {
  if (action === "retry") return status === "retryable";
  if (action === "replace") return status === "pending";
  return status === "retryable" || status === "pending";
}

export function sendFailureMessage(error: unknown): string {
  const code = error !== null && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (error !== null && typeof error === "object" && "code" in error && error.code === 4001) {
    return "You declined in your wallet. The recorded send is still here; check its status before trying again.";
  }
  switch (code) {
    case "wallet_reserved_nonce_mismatch": return "Your wallet's next transaction number differs from this send. Check its status before trying again.";
    case "wallet_assignment_mismatch": return "This is not the wallet your winnings were paid to. Nothing was signed.";
    case "wallet_wrong_chain": return "Your wallet could not switch to Base Sepolia. Nothing was signed.";
    case "wallet_insufficient_token_balance": return "Your wallet does not hold enough USDC for this send.";
    case "wallet_insufficient_gas_balance": return "Your wallet needs more ETH for the network fee.";
    case "wallet_reauthentication_required": return "Your wallet sign-in expired. Sign in again.";
    case "wallet_fee_changed": return "The network fee changed. Review it again before sending.";
    default: return "The send could not be completed. Check its recorded status before trying again.";
  }
}
