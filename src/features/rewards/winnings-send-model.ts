import { formatUnits, getAddress, isAddress, parseUnits, zeroAddress } from "viem";
import type { RewardCredit } from "../../api/reward-claim.ts";
import type { GasTopup, GasTopupRequest, WinningsChainReads, WinningsSender } from "../../api/reward-winnings-send.ts";
import type { SendMarker } from "./winnings-send-marker.ts";
import {
  isWalletRefusal, RewardFundingNotBroadcastError,
  type RewardFeeEstimate, type RewardTokenTransfer, type RewardTransferWallet,
} from "../../api/reward-wallet-session.ts";

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

export type SendFailure =
  | "unavailable" | "gas_failed" | "gas_timeout" | "gas_limit_no_eth" | "no_eth"
  | "insufficient_usdc" | "wrong_wallet" | "wrong_network" | "signed_out" | "refused"
  | "in_progress" | "check_failed" | "not_sent" | "failed";

export type SendState =
  | Readonly<{ kind: "gas" }>
  | Readonly<{ kind: "review"; fee: RewardFeeEstimate; gasLimitReached: boolean; feeChanged: boolean }>
  | Readonly<{ kind: "sending" }>
  | Readonly<{ kind: "sent"; transactionHash: string }>
  | Readonly<{ kind: "uncertain" }>
  | Readonly<{ kind: "failed"; reason: SendFailure; topupId?: string }>;

function errorCode(error: unknown): string {
  if (error !== null && typeof error === "object") {
    if ("code" in error && typeof error.code === "string") return error.code;
    if (error instanceof Error) return error.message;
  }
  return "";
}

/** Maps a wallet error from estimate or send to what the person can do next. */
export function walletFailure(error: unknown, gasLimitReached: boolean): SendFailure {
  if (isWalletRefusal(error)) return "refused";
  switch (errorCode(error)) {
    case "provider_unavailable": return "unavailable";
    case "wallet_insufficient_gas_balance": return gasLimitReached ? "gas_limit_no_eth" : "no_eth";
    case "wallet_insufficient_token_balance": return "insufficient_usdc";
    case "wallet_assignment_mismatch": return "wrong_wallet";
    case "wallet_wrong_chain": return "wrong_network";
    case "wallet_reauthentication_required": case "wallet_session_closed": return "signed_out";
    case "wallet_transfer_in_progress": return "in_progress";
    case "wallet_transfer_check_failed": return "check_failed";
    default: return "failed";
  }
}

export function failureMessage(reason: SendFailure): string {
  switch (reason) {
    case "unavailable": return "Sending winnings is not available right now. Try again later.";
    case "gas_failed": return "We could not add gas to your wallet for this transfer. Nothing was sent.";
    case "gas_timeout": return "Gas for this transfer is taking longer than usual. Nothing was sent yet.";
    case "gas_limit_no_eth": return "Gas help is used up for today, and your wallet does not have enough ETH for the network fee. Try again tomorrow.";
    case "no_eth": return "Your wallet does not have enough ETH for the network fee.";
    case "insufficient_usdc": return "Your wallet does not have enough USDC for this amount.";
    case "wrong_wallet": return "The wallet you signed in to is not the wallet your winnings were paid to. Nothing was sent.";
    case "wrong_network": return "Your wallet could not switch to Base Sepolia. Nothing was sent.";
    case "signed_out": return "Your wallet sign-in expired. Sign in again to continue.";
    case "refused": return "You declined the transfer in your wallet. Nothing was sent.";
    case "in_progress": return "A transfer from this wallet is still in progress. Wait for it to finish, then try again.";
    case "check_failed": return "We could not check your wallet's recent transfers, so nothing was sent. Try again.";
    case "not_sent": return "The transfer could not be started. Nothing was sent.";
    case "failed": return "The transfer could not be prepared. Nothing was sent.";
  }
}

export type WinningsSendControllerOptions = Readonly<{
  creditId: string;
  transfer: RewardTokenTransfer;
  wallet: Pick<RewardTransferWallet, "estimateTransfer" | "sendTransfer">;
  requestGasTopup(creditId: string, idempotencyKey: string): Promise<GasTopupRequest>;
  readGasTopup(topupId: string): Promise<GasTopup>;
  onState(state: SendState): void;
  /** Pending nonce above latest: an earlier transfer is still in the mempool. */
  walletBusy(): Promise<boolean>;
  /** Called just before the send RPC, with the hash once known, or when nothing was sent after all. */
  broadcast?: Readonly<{
    started(): void;
    hashed(transactionHash: string): void;
    abandoned(): void;
  }>;
  newKey?: () => string;
  poll?: GasPollOptions | undefined;
}>;

/**
 * One send of a fixed transfer: platform gas, fee estimate, explicit confirm,
 * then a single broadcast. An uncertain broadcast is final for this sheet;
 * nothing here offers to send again after the wallet may have sent.
 */
export function createWinningsSendController(options: WinningsSendControllerOptions) {
  const transfer = Object.freeze({ ...options.transfer });
  const newKey = options.newKey ?? (() => crypto.randomUUID());
  let state: SendState = { kind: "gas" };
  let gasLimitReached = false;
  let busy = false;
  let broadcastStarted = false;
  let closed = false;
  const publish = (next: SendState) => {
    if (closed) return state;
    state = Object.freeze(next);
    options.onState(state);
    return state;
  };
  const exclusive = async (operation: () => Promise<SendState>) => {
    if (busy || closed) return state;
    if (state.kind === "sent" || state.kind === "uncertain" || broadcastStarted) return state;
    busy = true;
    try { return await operation(); }
    finally { busy = false; }
  };
  const estimate = async (feeChanged: boolean) => {
    try {
      const fee = await options.wallet.estimateTransfer(transfer);
      return publish({ kind: "review", fee: Object.freeze({ ...fee }), gasLimitReached, feeChanged });
    } catch (error) {
      return publish({ kind: "failed", reason: walletFailure(error, gasLimitReached) });
    }
  };
  /** Refuses while an earlier transfer from this wallet is still pending. */
  const assertIdle = async () => {
    let busyWallet: boolean;
    try { busyWallet = await options.walletBusy(); }
    catch { throw new Error("wallet_transfer_check_failed"); }
    if (busyWallet) throw new Error("wallet_transfer_in_progress");
  };
  const awaitGas = async (topupId: string) => {
    const outcome = await waitForGasTopup(options.readGasTopup, topupId, { ...options.poll, cancelled: () => closed });
    if (outcome === "confirmed") return estimate(false);
    return publish({ kind: "failed", reason: outcome === "released" ? "gas_failed" : "gas_timeout", topupId });
  };
  return {
    get state() { return state; },
    /** A fresh idempotency key per attempt: a new attempt may need new gas. */
    prepare: () => exclusive(async () => {
      publish({ kind: "gas" });
      gasLimitReached = false;
      try { await assertIdle(); }
      catch (error) { return publish({ kind: "failed", reason: walletFailure(error, false) }); }
      let request: GasTopupRequest;
      try { request = await options.requestGasTopup(options.creditId, newKey()); }
      catch (error) {
        return publish({ kind: "failed", reason: errorCode(error) === "provider_unavailable" ? "unavailable" : "gas_failed" });
      }
      if (request.status === "limit_reached") {
        gasLimitReached = true;
        return estimate(false);
      }
      if (request.status === "not_needed") return estimate(false);
      if (request.topup_id === null) return publish({ kind: "failed", reason: "gas_failed" });
      return awaitGas(request.topup_id);
    }),
    /** Keeps waiting on the same top-up after a timeout; never requests new gas. */
    checkGasAgain: () => exclusive(async () => {
      if (state.kind !== "failed" || state.topupId === undefined) return state;
      const topupId = state.topupId;
      publish({ kind: "gas" });
      return awaitGas(topupId);
    }),
    /** Tries with the wallet's own ETH after gas could not be provided. */
    continueWithoutGas: () => exclusive(async () => {
      publish({ kind: "gas" });
      return estimate(false);
    }),
    confirm: () => exclusive(async () => {
      if (state.kind !== "review") return state;
      const fee = state.fee;
      let started = false;
      try {
        const hash = await options.wallet.sendTransfer(transfer, fee, async () => {
          if (closed) throw new Error("winnings_send_closed");
          await assertIdle();
          if (closed) throw new Error("winnings_send_closed");
          options.broadcast?.started();
          started = true;
          broadcastStarted = true;
          publish({ kind: "sending" });
        });
        options.broadcast?.hashed(hash);
        return publish({ kind: "sent", transactionHash: hash });
      } catch (error) {
        if (!started) {
          if (errorCode(error) === "wallet_fee_changed") return estimate(true);
          return publish({ kind: "failed", reason: walletFailure(error, gasLimitReached) });
        }
        // A local check that failed before the send RPC, or the wallet declining
        // to sign (EIP-1193 4001), sent nothing. Anything else may have been sent.
        if (error instanceof RewardFundingNotBroadcastError) {
          broadcastStarted = false;
          options.broadcast?.abandoned();
          return publish({ kind: "failed", reason: walletFailure(error.cause, gasLimitReached) === "signed_out" ? "signed_out" : "not_sent" });
        }
        if (isWalletRefusal(error)) {
          broadcastStarted = false;
          options.broadcast?.abandoned();
          return publish({ kind: "failed", reason: "refused" });
        }
        return publish({ kind: "uncertain" });
      }
    }),
    close() { closed = true; },
  };
}

export type WinningsSendController = ReturnType<typeof createWinningsSendController>;

export function transferFor(credit: RewardCredit, sender: WinningsSender, recipient: string, atomic: bigint): RewardTokenTransfer {
  return { sender: sender.address, token: credit.token_address, recipient, amountAtomic: atomic.toString(), walletIndex: sender.walletIndex };
}

export const SEND_AGAIN_AFTER_MS = 30 * 60 * 1000;

export type MarkerStatus =
  | Readonly<{ kind: "confirmed" | "reverted" | "pending" | "check_failed" }>
  | Readonly<{ kind: "unknown"; canSendAgain: boolean }>;

/**
 * What became of a transfer that reached the broadcast step. Without a hash
 * nothing can be looked up, so another send is only offered once nothing is
 * pending from the wallet and 30 minutes have passed.
 */
export async function checkSendMarker(
  marker: SendMarker,
  reads: Pick<WinningsChainReads, "transferReceipt" | "walletBusy">,
  now: number,
): Promise<MarkerStatus> {
  try {
    if (marker.transactionHash !== null) return { kind: await reads.transferReceipt(marker.transactionHash) };
    if (await reads.walletBusy(marker.sender)) return { kind: "pending" };
    return { kind: "unknown", canSendAgain: now - marker.startedAt >= SEND_AGAIN_AFTER_MS };
  } catch {
    return { kind: "check_failed" };
  }
}
