import { encodeFunctionData, erc20Abi, getAddress, toHex } from "viem";
import type { ExternalWallet } from "@privy-io/js-sdk-core";
import {
  defaultPrivyFactory, MemoryOnlyStorage,
  type EthereumProvider, type OAuthProvider, type PrivyFactory,
} from "./privy-session.ts";
import type { RewardFundingContext } from "./reward-funding-client.ts";
import type { VerificationPublicConfig } from "./verification-config.ts";

export interface RewardFeeEstimate {
  readonly gasLimit: string;
  readonly gasPriceAtomic: string;
  readonly executionFeeAtomic: string;
}
export interface RewardWallet {
  estimate(context: RewardFundingContext): Promise<RewardFeeEstimate>;
  send(context: RewardFundingContext, fee: RewardFeeEstimate, beforeBroadcast: () => Promise<void>): Promise<string>;
  dispose(): void;
}
/**
 * One ERC-20 transfer on Base Sepolia from a persona's embedded wallet. The
 * funding flow and the winnings send both describe their transfer this way,
 * so they share one signing path.
 */
export interface RewardTokenTransfer {
  readonly sender: string;
  readonly token: string;
  readonly recipient: string;
  readonly amountAtomic: string;
  readonly walletIndex: number;
}
export interface RewardTransferWallet {
  selectTestnetFor(transfer: RewardTokenTransfer): Promise<void>;
  estimateTransfer(transfer: RewardTokenTransfer): Promise<RewardFeeEstimate>;
  sendTransfer(transfer: RewardTokenTransfer, fee: RewardFeeEstimate, beforeBroadcast: () => Promise<void>): Promise<string>;
  dispose(): void;
}
export interface RewardWalletSession extends RewardWallet, RewardTransferWallet {
  sendCode(email: string): Promise<void>;
  loginWithCode(email: string, code: string): Promise<void>;
  beginOAuth(provider: OAuthProvider, redirectURI: string): Promise<string>;
  completeOAuth(provider: OAuthProvider, code: string, state: string): Promise<void>;
  loginWithWallet(): Promise<void>;
  selectTestnet(context: RewardFundingContext): Promise<void>;
}

/** Only the adapter's local checks before invoking the send RPC may create this. */
export class RewardFundingNotBroadcastError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "funding_not_broadcast", { cause });
    this.name = "RewardFundingNotBroadcastError";
  }
}

export function isWalletRefusal(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === 4001;
}
function rpcInteger(value: unknown): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/iu.test(value)) throw new Error("wallet_invalid_response");
  return BigInt(value);
}
/** The funding instruction as a transfer; its checks run first, so funding errors are unchanged. */
export function fundingTransfer(context: RewardFundingContext): RewardTokenTransfer {
  const f = context.funding;
  if (f.chain_id !== 84532 || !/^[1-9][0-9]*$/u.test(f.expected_amount_atomic)) throw new Error("funding_instruction_mismatch");
  if (BigInt(f.expected_amount_atomic) >= 2n ** 256n) throw new Error("funding_amount_out_of_range");
  return {
    sender: f.sender_address, token: f.token_address, recipient: f.recipient_address,
    amountAtomic: f.expected_amount_atomic, walletIndex: context.walletIndex,
  };
}
export function tokenTransfer(transfer: RewardTokenTransfer) {
  if (!/^[1-9][0-9]*$/u.test(transfer.amountAtomic)) throw new Error("transfer_invalid_amount");
  const amount = BigInt(transfer.amountAtomic);
  if (amount >= 2n ** 256n) throw new Error("transfer_invalid_amount");
  return {
    from: getAddress(transfer.sender), to: getAddress(transfer.token),
    value: "0x0" as const, chainId: toHex(84532),
    data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [getAddress(transfer.recipient), amount] }),
  };
}
export function rewardTransfer(context: RewardFundingContext) {
  return tokenTransfer(fundingTransfer(context));
}

/** A separate, short-lived Privy login. It never exchanges or replaces the app cookie. */
export async function createRewardWalletSession(
  config: VerificationPublicConfig,
  factory: PrivyFactory = defaultPrivyFactory,
): Promise<RewardWalletSession> {
  if (!config.enabled || !config.privyAppId) throw new Error("wallet_auth_unavailable");
  const storage = new MemoryOnlyStorage();
  const client = await factory(config, storage);
  try { await client.initialize(); }
  catch (error) { storage.clear(); client.dispose?.(); throw error; }
  let disposed = false;
  let authorizedUntil = 0;
  let authenticating = false;
  const cleanup = () => { storage.clear(); client.dispose?.(); };
  const alive = () => { if (disposed) throw new Error("wallet_session_closed"); };
  const authorized = () => {
    alive();
    if (Date.now() >= authorizedUntil) throw new Error("wallet_reauthentication_required");
  };
  const authenticate = async (operation: () => Promise<void>) => {
    alive();
    if (authenticating) throw new Error("wallet_authentication_in_progress");
    authenticating = true;
    authorizedUntil = 0;
    try {
      await operation();
      alive();
      const token = await client.getAccessToken();
      alive();
      if (token === null || token.length === 0) throw new Error("wallet_reauthentication_required");
      authorizedUntil = Date.now() + 5 * 60_000;
    } finally {
      authenticating = false;
      if (disposed) cleanup();
    }
  };
  const providerFor = async (transfer: RewardTokenTransfer) => {
    authorized();
    if (client.getEmbeddedEthereumProvider === undefined) throw new Error("wallet_provider_unavailable");
    const provider = await client.getEmbeddedEthereumProvider(transfer.walletIndex, transfer.sender);
    authorized();
    // Each embedded provider starts on the SDK's default chain, and a switch does
    // not carry over to the next provider, so every one is moved to Base Sepolia.
    // verifyProvider still refuses a wallet that ignores the switch.
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: toHex(84532) }] });
    authorized();
    return provider;
  };
  const verifyProvider = async (provider: EthereumProvider, transfer: RewardTokenTransfer) => {
    const accounts = await provider.request({ method: "eth_accounts" });
    authorized();
    if (!Array.isArray(accounts) || accounts.length !== 1 || typeof accounts[0] !== "string" ||
        getAddress(accounts[0]) !== getAddress(transfer.sender)) throw new Error("wallet_assignment_mismatch");
    const chain = rpcInteger(await provider.request({ method: "eth_chainId" }));
    authorized();
    if (chain !== 84532n) throw new Error("wallet_wrong_chain");
  };
  const estimateWith = async (provider: EthereumProvider, transfer: RewardTokenTransfer) => {
    await verifyProvider(provider, transfer);
    const tx = tokenTransfer(transfer);
    const tokenBalance = rpcInteger(await provider.request({ method: "eth_call", params: [{
      to: tx.to, data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [tx.from] }),
    }, "latest"] }));
    authorized();
    if (tokenBalance < BigInt(transfer.amountAtomic)) throw new Error("wallet_insufficient_token_balance");
    const gas = rpcInteger(await provider.request({ method: "eth_estimateGas", params: [tx] }));
    const price = rpcInteger(await provider.request({ method: "eth_gasPrice" }));
    const native = rpcInteger(await provider.request({ method: "eth_getBalance", params: [tx.from, "pending"] }));
    authorized();
    if (gas <= 0n || price <= 0n) throw new Error("wallet_invalid_fee_estimate");
    const gasLimit = (gas * 120n + 99n) / 100n;
    if (native < gasLimit * price) throw new Error("wallet_insufficient_gas_balance");
    return { gasLimit: gasLimit.toString(), gasPriceAtomic: price.toString(), executionFeeAtomic: (gasLimit * price).toString() };
  };
  return {
    async sendCode(email) {
      alive();
      const response = await client.auth.email.sendCode(email);
      alive();
      if (!response.success) throw new Error("wallet_auth_failed");
    },
    loginWithCode: (email, code) => authenticate(() => client.auth.email.loginWithCode(email, code)),
    async beginOAuth(provider, redirectURI) {
      alive();
      if (client.auth.oauth === undefined) throw new Error("oauth_unavailable");
      const response = await client.auth.oauth.generateURL(provider, redirectURI);
      alive();
      return response.url;
    },
    completeOAuth: (provider, code, state) => authenticate(async () => {
      if (client.auth.oauth === undefined) throw new Error("oauth_unavailable");
      await client.auth.oauth.loginWithCode(code, state, provider);
    }),
    loginWithWallet: () => authenticate(async () => {
      if (typeof window === "undefined" || client.auth.siwe === undefined) throw new Error("wallet_auth_unavailable");
      // SAFETY: this optional injected property is checked for a request method before use.
      const injected = (window as Window & { ethereum?: EthereumProvider }).ethereum;
      if (injected === undefined || typeof injected.request !== "function") throw new Error("wallet_auth_unavailable");
      const accounts = await injected.request({ method: "eth_requestAccounts" });
      alive();
      if (!Array.isArray(accounts) || typeof accounts[0] !== "string") throw new Error("wallet_auth_failed");
      const chain = rpcInteger(await injected.request({ method: "eth_chainId" }));
      alive();
      const wallet: ExternalWallet = { address: getAddress(accounts[0]), chainId: `eip155:${chain}`, connectorType: "injected" };
      const { message } = await client.auth.siwe.init(wallet, window.location.host, window.location.origin);
      alive();
      const signature = await injected.request({ method: "personal_sign", params: [message, wallet.address] });
      alive();
      if (typeof signature !== "string" || !/^0x[0-9a-f]+$/iu.test(signature)) throw new Error("wallet_auth_failed");
      await client.auth.siwe.loginWithSiwe(signature, wallet, message);
    }),
    selectTestnet: async context => selectTestnetFor(fundingTransfer(context)),
    selectTestnetFor,
    estimate: async context => estimateTransfer(fundingTransfer(context)),
    estimateTransfer,
    send: async (context, fee, beforeBroadcast) => sendTransfer(fundingTransfer(context), fee, beforeBroadcast),
    sendTransfer,
    dispose() { disposed = true; authorizedUntil = 0; cleanup(); },
  };
  async function selectTestnetFor(transfer: RewardTokenTransfer) {
    await verifyProvider(await providerFor(transfer), transfer);
  }
  async function estimateTransfer(transfer: RewardTokenTransfer) { return estimateWith(await providerFor(transfer), transfer); }
  async function sendTransfer(transfer: RewardTokenTransfer, fee: RewardFeeEstimate, beforeBroadcast: () => Promise<void>) {
    const provider = await providerFor(transfer);
    const current = await estimateWith(provider, transfer);
    if (BigInt(current.executionFeeAtomic) > BigInt(fee.executionFeeAtomic) ||
        BigInt(current.gasLimit) > BigInt(fee.gasLimit) ||
        BigInt(current.gasPriceAtomic) > BigInt(fee.gasPriceAtomic)) throw new Error("wallet_fee_changed");
    await verifyProvider(provider, transfer);
    await beforeBroadcast();
    let transaction;
    try {
      authorized();
      transaction = { ...tokenTransfer(transfer), gas: toHex(BigInt(fee.gasLimit)), gasPrice: toHex(BigInt(fee.gasPriceAtomic)) };
    } catch (cause) {
      // No provider call occurs inside this block. Provider errors must never authorize retry.
      throw new RewardFundingNotBroadcastError(cause);
    }
    const result = await provider.request({ method: "eth_sendTransaction", params: [transaction] });
    if (typeof result !== "string" || !/^0x[0-9a-f]{64}$/iu.test(result)) throw new Error("wallet_submission_uncertain");
    return result.toLowerCase();
  }
}
