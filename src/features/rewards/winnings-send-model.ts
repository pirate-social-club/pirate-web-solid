import { formatUnits, getAddress, isAddress, parseUnits, zeroAddress } from "viem";
import type { RewardCredit } from "../../api/reward-claim.ts";
import type { GasTopup, GasTopupRequest, WinningsSender } from "../../api/reward-winnings-send.ts";
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

/** Checksum-insensitive: any 0x address with 40 hex digits, never the sender itself. */
export function checkRecipient(input: string, sender: string): RecipientCheck {
  const value = input.trim();
  if (value.length === 0) return { ok: false, message: "Enter the address to send to." };
  if (!/^0x[0-9a-fA-F]{40}$/u.test(value) || !isAddress(value, { strict: false })) {
    return { ok: false, message: "Enter a valid address that starts with 0x." };
  }
  const address = getAddress(value.toLowerCase());
  if (address === zeroAddress) return { ok: false, message: "This address cannot receive USDC." };
  if (address === getAddress(sender.toLowerCase())) return { ok: false, message: "This is the wallet you are sending from. Enter a different address." };
  return { ok: true, address };
}

export type AmountCheck = Readonly<{ ok: true; atomic: bigint }> | Readonly<{ ok: false; message: string }>;

/** A positive USDC amount, never more than the known wallet balance. */
export function checkAmount(input: string, decimals: number, balance: bigint | undefined): AmountCheck {
  const value = input.trim();
  const pattern = new RegExp(`^(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,${decimals}})?$`, "u");
  if (!pattern.test(value)) return { ok: false, message: `Enter an amount with up to ${decimals} decimal places.` };
  const atomic = parseUnits(value, decimals);
  if (atomic <= 0n) return { ok: false, message: "Enter an amount above zero." };
  if (balance !== undefined && atomic > balance) {
    return { ok: false, message: `You can send up to ${formatUnits(balance, decimals)} USDC.` };
  }
  return { ok: true, atomic };
}

/** The credit amount, lowered to the wallet balance when the wallet holds less. */
export function defaultAmount(credit: RewardCredit, balance: bigint | undefined): string {
  const credited = BigInt(credit.amount_atomic);
  const amount = balance !== undefined && balance < credited ? balance : credited;
  return formatUnits(amount, credit.token_decimals);
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
  | "not_sent" | "failed";

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
          started = true;
          broadcastStarted = true;
          publish({ kind: "sending" });
        });
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
          return publish({ kind: "failed", reason: walletFailure(error.cause, gasLimitReached) === "signed_out" ? "signed_out" : "not_sent" });
        }
        if (isWalletRefusal(error)) {
          broadcastStarted = false;
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
