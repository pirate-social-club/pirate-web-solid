import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, erc20Abi } from "viem";
import type { Storage } from "@privy-io/js-sdk-core";
import { createRewardWalletSession, fundingTransfer, rewardTransfer, RewardFundingNotBroadcastError } from "./reward-wallet-session.ts";
import type { EthereumProvider, PrivyAuthClient } from "./privy-session.ts";
import { createRewardFundingController } from "./reward-funding-controller.ts";
import type { RewardFundingReceipt } from "./reward-funding-recovery.ts";
import { actor, target, context, fee, recipient, sender, token, transactionHash } from "../../test/fixtures/reward-funding.ts";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function harness() {
  const requests: Array<{ method: string; params?: readonly unknown[] }> = [];
  const responses = new Map<string, unknown>([
    ["eth_accounts", [sender]], ["eth_chainId", "0x14a34"], ["eth_call", "0x989680"],
    ["eth_estimateGas", "0xc350"], ["eth_gasPrice", "0x2"], ["eth_getBalance", "0x989680"],
    ["eth_sendTransaction", transactionHash], ["wallet_switchEthereumChain", null],
    ["eth_getTransactionCount", "0x7"],
  ]);
  const provider: EthereumProvider = { request: vi.fn(async request => { requests.push(request); return responses.get(request.method); }) };
  let storage: Storage | undefined;
  const client: PrivyAuthClient = {
    initialize: vi.fn(async () => undefined), getAccessToken: vi.fn(async () => "private-provider-token"),
    auth: {
      email: { sendCode: vi.fn(async () => ({ success: true })), loginWithCode: vi.fn(async () => { storage?.put("credential", "private-provider-token"); }) },
      oauth: { generateURL: vi.fn(async () => ({ url: "https://auth.example/authorize" })), loginWithCode: vi.fn(async () => undefined) },
      siwe: { init: vi.fn(async () => ({ message: "login challenge" })), loginWithSiwe: vi.fn(async () => undefined) },
    },
    getEmbeddedEthereumProvider: vi.fn(async () => provider), dispose: vi.fn(),
  };
  const create = () => createRewardWalletSession({ enabled: true, privyAppId: "app" }, async (_config, memory) => { storage = memory; return client; });
  return { create, client, provider, responses, requests, storage: () => storage };
}

describe("explicit persona wallet authorization", () => {
  it("requires separate authentication before touching a provider", async () => {
    const h = harness(); const session = await h.create();
    await expect(session.estimate(context())).rejects.toThrow("wallet_reauthentication_required");
    expect(h.client.getEmbeddedEthereumProvider).not.toHaveBeenCalled();
  });
  it.each(["asset_bonus", "megapot_pool"] as const)("constructs only the exact %s token transfer", async kind => {
    const h = harness(); const session = await h.create();
    await session.sendCode("operator@example.test"); await session.loginWithCode("operator@example.test", "fixture-code");
    expect(await session.estimate(context(kind))).toEqual(fee);
    const before = vi.fn(async () => { expect(h.requests.some(item => item.method === "eth_sendTransaction")).toBe(false); });
    expect(await session.send(context(kind), fee, before)).toBe(transactionHash);
    expect(before).toHaveBeenCalledOnce();
    expect(h.client.getEmbeddedEthereumProvider).toHaveBeenCalledWith(3, sender);
    const submission = h.requests.find(item => item.method === "eth_sendTransaction");
    expect(submission?.params).toEqual([{ ...rewardTransfer(context(kind)), gas: "0xea60", gasPrice: "0x2" }]);
    const tx = rewardTransfer(context(kind));
    expect(tx).toMatchObject({ from: sender, to: token, value: "0x0", chainId: "0x14a34" });
    expect(decodeFunctionData({ abi: erc20Abi, data: tx.data })).toMatchObject({ functionName: "transfer", args: [recipient, 1000000n] });
    expect(h.requests.some(item => item.method === "personal_sign")).toBe(false);
  });
  it("moves every fresh embedded provider to Base Sepolia before using it", async () => {
    const h = harness(); const session = await h.create();
    // A real Privy provider starts on its default chain and forgets a switch
    // made on an earlier provider instance.
    h.client.getEmbeddedEthereumProvider = vi.fn(async () => {
      let chain = "0x1";
      return { request: vi.fn(async request => {
        h.requests.push(request);
        if (request.method === "wallet_switchEthereumChain") {
          const [target] = request.params ?? [];
          if (target !== null && typeof target === "object" && "chainId" in target && typeof target.chainId === "string") chain = target.chainId;
          return null;
        }
        if (request.method === "eth_chainId") return chain;
        return h.responses.get(request.method);
      }) };
    });
    await session.sendCode("operator@example.test"); await session.loginWithCode("operator@example.test", "fixture-code");
    await session.selectTestnet(context());
    expect(await session.estimate(context())).toEqual(fee);
    expect(await session.send(context(), fee, async () => undefined)).toBe(transactionHash);
    expect(h.client.getEmbeddedEthereumProvider).toHaveBeenCalledTimes(3);
  });
  it.each([
    ["eth_accounts", [recipient], "wallet_assignment_mismatch"],
    ["eth_chainId", "0x1", "wallet_wrong_chain"],
    ["eth_call", "0x0", "wallet_insufficient_token_balance"],
    ["eth_getBalance", "0x0", "wallet_insufficient_gas_balance"],
    ["eth_gasPrice", "garbage", "wallet_invalid_response"],
  ])("fails before broadcast for %s", async (method, value, message) => {
    const h = harness(); const session = await h.create(); await session.loginWithCode("a", "b");
    h.responses.set(String(method), value);
    const before = vi.fn(async () => undefined);
    await expect(session.send(context(), fee, before)).rejects.toThrow(String(message));
    expect(before).not.toHaveBeenCalled();
    expect(h.requests.some(item => item.method === "eth_sendTransaction")).toBe(false);
  });
  it("requires a fresh review when fees rise", async () => {
    const h = harness(); const session = await h.create(); await session.loginWithCode("a", "b");
    h.responses.set("eth_gasPrice", "0x3");
    await expect(session.send(context(), fee, async () => undefined)).rejects.toThrow("wallet_fee_changed");
    expect(h.requests.some(item => item.method === "eth_sendTransaction")).toBe(false);
  });
  it("does not mask a provider refusal", async () => {
    const h = harness(); const session = await h.create(); await session.loginWithCode("a", "b");
    const request = h.provider.request; const refusal = Object.assign(new Error("declined"), { code: 4001 });
    h.provider.request = async args => { if (args.method === "eth_sendTransaction") throw refusal; return request(args); };
    await expect(session.send(context(), fee, async () => undefined)).rejects.toBe(refusal);
  });
  it("rejects an invalid hash as uncertain submission", async () => {
    const h = harness(); const session = await h.create(); await session.loginWithCode("a", "b");
    h.responses.set("eth_sendTransaction", "not-a-hash");
    await expect(session.send(context(), fee, async () => undefined)).rejects.toThrow("wallet_submission_uncertain");
  });
  it("fails closed on a provider assignment mismatch", async () => {
    const h = harness(); const session = await h.create(); await session.loginWithCode("a", "b");
    h.client.getEmbeddedEthereumProvider = async () => { throw new Error("wallet_assignment_mismatch"); };
    await expect(session.estimate(context())).rejects.toThrow("wallet_assignment_mismatch");
    expect(h.requests).toEqual([]);
  });
  it("clears credentials and rejects future use after disposal", async () => {
    const h = harness(); const session = await h.create(); await session.loginWithCode("a", "b");
    expect(h.storage()?.getKeys()).toContain("credential");
    session.dispose();
    expect(h.storage()?.getKeys()).toEqual([]);
    expect(h.client.dispose).toHaveBeenCalledOnce();
    await expect(session.estimate(context())).rejects.toThrow("wallet_session_closed");
  });
  it("requires new authentication after five minutes", async () => {
    vi.useFakeTimers(); const h = harness(); const session = await h.create(); await session.loginWithCode("a", "b");
    vi.advanceTimersByTime(300001);
    await expect(session.estimate(context())).rejects.toThrow("wallet_reauthentication_required");
  });
  it("cleans up late authentication after disposal", async () => {
    const h = harness(); const session = await h.create();
    let finish = () => {};
    h.client.auth.email.loginWithCode = () => new Promise<void>(resolve => { finish = () => { h.storage()?.put("credential", "late"); resolve(); }; });
    const pending = session.loginWithCode("a", "b"); session.dispose(); finish();
    await expect(pending).rejects.toThrow("wallet_session_closed");
    expect(h.storage()?.getKeys()).toEqual([]);
  });
  it("uses OAuth only for the separate provider session", async () => {
    const h = harness(); const session = await h.create();
    expect(await session.beginOAuth("google", "https://app.example/return")).toBe("https://auth.example/authorize");
    await session.completeOAuth("google", "code", "state");
    expect(h.client.auth.oauth?.loginWithCode).toHaveBeenCalledWith("code", "state", "google");
    await session.estimate(context());
  });
  it("uses the injected wallet for SIWE only and the assigned embedded provider for funding", async () => {
    const h = harness(); const injected = vi.fn(async (request: { method: string }) => {
      if (request.method === "eth_requestAccounts") return [recipient];
      if (request.method === "eth_chainId") return "0x1";
      if (request.method === "personal_sign") return "0xabcd";
      throw new Error("unexpected external wallet request");
    });
    vi.stubGlobal("window", { location: { host: "app.example", origin: "https://app.example" }, ethereum: { request: injected } });
    const session = await h.create(); await session.loginWithWallet();
    await session.send(context(), fee, async () => undefined);
    expect(injected.mock.calls.map(([request]) => request.method)).toEqual(["eth_requestAccounts", "eth_chainId", "personal_sign"]);
    expect(h.client.getEmbeddedEthereumProvider).toHaveBeenCalledWith(3, sender);
  });
  it("proves expiry after the receipt callback is still before the send RPC", async () => {
    vi.useFakeTimers(); const h = harness(); const session = await h.create(); await session.loginWithCode("a", "b");
    const before = vi.fn(async () => { vi.advanceTimersByTime(300001); });
    await expect(session.send(context(), fee, before)).rejects.toBeInstanceOf(RewardFundingNotBroadcastError);
    expect(before).toHaveBeenCalledOnce();
    expect(h.requests.some(item => item.method === "eth_sendTransaction")).toBe(false);
  });
  it("passes the server-reserved nonce to the wallet transaction", async () => {
    const h = harness(); const session = await h.create(); await session.loginWithCode("a", "b");
    const transfer = { ...fundingTransfer(context()), nonce: 7 };
    await session.sendTransfer(transfer, fee, async () => undefined);
    const submission = h.requests.find(item => item.method === "eth_sendTransaction");
    expect(submission?.params?.[0]).toMatchObject({ nonce: "0x7", from: sender, to: token });
    expect(h.requests.filter(item => item.method === "eth_getTransactionCount")).toHaveLength(2);
  });
  it("refuses a mismatched pending nonce before calling the wallet send RPC", async () => {
    const h = harness(); const session = await h.create(); await session.loginWithCode("a", "b");
    h.responses.set("eth_getTransactionCount", "0x8");
    await expect(session.sendTransfer({ ...fundingTransfer(context()), nonce: 7 }, fee, async () => undefined))
      .rejects.toThrow("wallet_reserved_nonce_mismatch");
    expect(h.requests.some(item => item.method === "eth_sendTransaction")).toBe(false);
  });
  it("permits a same-nonce replacement while the earlier transaction is pending", async () => {
    const h = harness(); const session = await h.create(); await session.loginWithCode("a", "b");
    const original = h.provider.request;
    h.provider.request = async request => request.method === "eth_getTransactionCount"
      ? request.params?.[1] === "latest" ? "0x7" : "0x8"
      : original(request);
    const transfer = { ...fundingTransfer(context()), nonce: 7, allowReplacement: true };
    expect(await session.sendTransfer(transfer, fee, async () => undefined)).toBe(transactionHash);
    expect(h.requests.find(item => item.method === "eth_sendTransaction")?.params?.[0]).toMatchObject({ nonce: "0x7" });
  });
  it("uses the same nonce for a verified cancellation transaction", async () => {
    const h = harness(); const session = await h.create(); await session.loginWithCode("a", "b");
    const transfer = { ...fundingTransfer(context()), nonce: 7 };
    expect(await session.estimateCancellation(transfer)).toEqual(fee);
    await session.sendCancellation(transfer, fee, async () => undefined);
    expect(h.requests.find(item => item.method === "eth_sendTransaction")?.params).toEqual([{
      from: sender, to: sender, value: "0x0", chainId: "0x14a34", nonce: "0x7", gas: "0xea60", gasPrice: "0x2",
    }]);
  });

  it("re-authenticates and funds once after expiry between durable receipt and send", async () => {
    vi.useFakeTimers(); const h = harness(); const session = await h.create(); await session.loginWithCode("a", "b");
    const receipts = new Map<string, RewardFundingReceipt>(); let expire = true;
    const controller = createRewardFundingController({ actor, target, currentActor: () => actor, wallet: session,
      api: { load: async () => context(), observe: async (_t, _a, hash) => ({ ...context().funding, status: "confirming", transaction_hash: hash }) },
      recovery: {
        read: key => receipts.get(key) ?? null,
        write: (key, value) => { receipts.set(key, value); if (expire) { expire = false; vi.advanceTimersByTime(300001); } },
        remove: key => { receipts.delete(key); }, exclusive: async (_key, operation) => operation(),
      },
    });
    const first = await controller.prepare(); if (first.kind !== "review") throw new Error("expected review");
    await expect(controller.confirm(first.review.id)).rejects.toThrow("wallet_reauthentication_required");
    expect(receipts.size).toBe(0);
    expect(h.requests.filter(item => item.method === "eth_sendTransaction")).toHaveLength(0);
    await session.loginWithCode("a", "b");
    const second = await controller.prepare(); if (second.kind !== "review") throw new Error("expected review");
    expect(await controller.confirm(second.review.id)).toMatchObject({ kind: "server", funding: { transaction_hash: transactionHash } });
    expect(h.requests.filter(item => item.method === "eth_sendTransaction")).toHaveLength(1);
  });

});
