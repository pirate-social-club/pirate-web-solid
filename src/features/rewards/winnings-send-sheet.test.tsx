import { createRoot } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, expect, test, vi } from "vitest";
import type { RewardCredit } from "../../api/reward-claim.ts";
import type { WinnerSendRecord, WinningsSendData } from "../../api/reward-winnings-send.ts";
import { WinningsSendSheet, type WinningsSendDependencies, type WinningsSendWallet } from "./winnings-send-sheet.tsx";
import { WalletWinnings } from "./wallet-winnings.tsx";

const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); });
const sender = "0x1111111111111111111111111111111111111111";
const payee = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const hash = `0x${"cd".repeat(32)}`;
const fee = { gasLimit: "60000", gasPriceAtomic: "1000000000", executionFeeAtomic: "60000000000000" };
const paid: RewardCredit = {
  object: "reward_credit", credit_id: "credit_paid", payout_persona_id: "persona_1", chain_id: 84532,
  token_address: "0x3333333333333333333333333333333333333333", token_decimals: 6,
  amount_atomic: "12500000", available_atomic: "0", reserved_atomic: "0", paid_atomic: "12500000",
  source_kind: "megapot_allocation", state: "sent", created_at: "2026-09-25T00:00:00.000Z",
  updated_at: "2026-09-25T00:00:00.000Z", settled_at: "2026-09-25T00:00:00.000Z",
  claim: { status: "accepted", payout_status: "confirmed" }, send: null,
};
const existing: WinnerSendRecord = {
  object: "reward_winner_send", send_id: "send_1", credit_id: paid.credit_id, status: "retryable",
  chain_id: 84532, sender, recipient: payee, token_address: paid.token_address,
  amount_atomic: paid.paid_atomic, nonce: 7, attempt: 1, transaction_hashes: [], cancellation_hashes: [],
};
function fixture(options: {
  initial?: WinnerSendRecord | null;
  createFails?: boolean;
  wallet?: Partial<WinningsSendWallet>;
  senderFails?: boolean;
} = {}) {
  let current = options.initial ?? null;
  const data: WinningsSendData = {
    sender: vi.fn(async () => { if (options.senderFails) throw new Error("missing"); return { address: sender, walletIndex: 2 }; }),
    tokenBalance: vi.fn(async () => 20_000_000n),
    readSend: vi.fn(async () => current),
    requestSend: vi.fn(async (_creditId, recipient, amount) => {
      if (options.createFails) throw new Error("create_failed");
      current = current?.status === "reverted"
        ? { ...current, status: "retryable", nonce: 8, attempt: 2, transaction_hashes: [] }
        : { ...existing, recipient, amount_atomic: amount };
      return current;
    }),
    attachTransfer: vi.fn(async (_sendId, transactionHash) => {
      current = { ...current!, status: "pending", transaction_hashes: [...current!.transaction_hashes, transactionHash] };
      return current;
    }),
    attachCancellation: vi.fn(async (_sendId, transactionHash) => {
      current = { ...current!, status: "pending", cancellation_hashes: [...current!.cancellation_hashes, transactionHash] };
      return current;
    }),
    replacementGasPrice: vi.fn(async () => 1_000_000_000n),
    requestGasTopup: vi.fn(async () => ({ status: "not_needed" as const, topup_id: null, amount_wei: null })),
    readGasTopup: vi.fn(async () => ({ status: "confirmed" as const, amount_wei: "1000", transaction_hash: null })),
  };
  const wallet: WinningsSendWallet = {
    sendCode: vi.fn(async () => undefined), loginWithCode: vi.fn(async () => undefined),
    selectTestnetFor: vi.fn(async () => undefined),
    estimateTransfer: vi.fn(async () => fee),
    sendTransfer: vi.fn(async (_transfer, _fee, before) => { await before(); return hash; }),
    estimateCancellation: vi.fn(async () => fee),
    sendCancellation: vi.fn(async (_transfer, _fee, before) => { await before(); return hash; }),
    dispose: vi.fn(), ...options.wallet,
  };
  const dependencies: WinningsSendDependencies = { data, openWallet: vi.fn(async () => wallet), poll: { intervalMs: 1, timeoutMs: 2 } };
  return { data, wallet, dependencies, setRecord: (next: WinnerSendRecord | null) => { current = next; } };
}
function mount(dependencies: WinningsSendDependencies) {
  const element = document.createElement("div"); document.body.appendChild(element);
  createRoot(dispose => { disposers.push(dispose); render(() => <WinningsSendSheet credit={paid} dependencies={dependencies} onClose={vi.fn()} />, element); });
}
const text = () => document.body.textContent ?? "";
const button = (name: string) => {
  const found = [...document.body.querySelectorAll("button")].find(item => item.textContent?.trim() === name);
  if (found === undefined) throw new Error(`No button ${name}: ${text()}`);
  return found;
};
async function type(label: string, value: string) {
  const labelled = [...document.body.querySelectorAll("label")].find(item => item.textContent === label);
  const input = labelled?.htmlFor ? document.getElementById(labelled.htmlFor) : labelled?.parentElement?.querySelector("input");
  if (!(input instanceof HTMLInputElement)) throw new Error(`No input ${label}`);
  input.value = value;
  input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
}
async function walletLogin() {
  await vi.waitFor(() => expect(text()).toContain("Sign in to your wallet"));
  await type("Email for your wallet", "winner@example.test");
  button("Send code").click();
  await vi.waitFor(() => expect(text()).toContain("Code"));
  await type("Code", "123456");
  button("Continue").click();
  await vi.waitFor(() => expect(text()).toContain("Network fee"));
}
async function newSend() {
  await vi.waitFor(() => expect(text()).toContain("Wallet balance: 20 USDC"));
  await type("Send to", payee);
  button("Continue").click();
  await walletLogin();
}

test("records before wallet signing, uses the reserved nonce, and attaches the hash", async () => {
  const f = fixture(); mount(f.dependencies);
  await newSend();
  expect(f.data.requestSend).not.toHaveBeenCalled();
  button("Send winnings").click();
  await vi.waitFor(() => expect(text()).toContain("network is still checking this send"));
  expect(f.data.requestSend).toHaveBeenCalledWith("credit_paid", expect.any(String), "12500000", expect.any(String));
  expect(f.wallet.sendTransfer).toHaveBeenCalledWith(expect.objectContaining({ nonce: 7, sender, amountAtomic: "12500000" }), fee, expect.any(Function));
  expect(f.data.attachTransfer).toHaveBeenCalledWith("send_1", hash);
  expect(document.body.querySelector("a")?.getAttribute("href")).toBe(`https://sepolia.basescan.org/tx/${hash}`);
});

test("a failed record write never calls the wallet", async () => {
  const f = fixture({ createFails: true }); mount(f.dependencies);
  await newSend(); button("Send winnings").click();
  await vi.waitFor(() => expect(text()).toContain("could not be completed"));
  expect(f.wallet.sendTransfer).not.toHaveBeenCalled();
  expect(f.data.readSend).toHaveBeenCalled();
});

test("after an uncertain RPC result the server record remains and retry uses the same nonce", async () => {
  const f = fixture({ wallet: { sendTransfer: vi.fn(async (_transfer, _fee, before) => { await before(); throw new Error("wallet_submission_uncertain"); }) } });
  mount(f.dependencies); await newSend(); button("Send winnings").click();
  await vi.waitFor(() => expect(text()).toContain("recorded transaction number"));
  expect(f.data.requestSend).toHaveBeenCalledTimes(1);
  button("Try send again").click(); await walletLogin(); button("Send winnings").click();
  await vi.waitFor(() => expect(f.wallet.sendTransfer).toHaveBeenCalledTimes(2));
  expect(f.data.requestSend).toHaveBeenCalledTimes(1);
  expect(f.wallet.sendTransfer).toHaveBeenLastCalledWith(expect.objectContaining({ nonce: 7 }), fee, expect.any(Function));
});

test("a pending send may only be replaced with a higher fee on its nonce", async () => {
  const f = fixture({ initial: { ...existing, status: "pending", transaction_hashes: [hash] } });
  mount(f.dependencies);
  await vi.waitFor(() => expect(text()).toContain("network is still checking this send"));
  expect(text()).not.toContain("Wallet balance:");
  button("Replace with higher fee").click(); await walletLogin();
  expect(f.wallet.estimateTransfer).toHaveBeenCalledWith(expect.objectContaining({ nonce: 7, allowReplacement: true }), 1_250_000_000n);
  button("Replace send").click();
  await vi.waitFor(() => expect(f.wallet.sendTransfer).toHaveBeenCalledTimes(1));
  expect(f.data.requestSend).not.toHaveBeenCalled();
});

test("cancel signs a zero-value self-transaction through the wallet adapter and attaches its hash", async () => {
  const f = fixture({ initial: existing }); mount(f.dependencies);
  await vi.waitFor(() => expect(text()).toContain("recorded transaction number"));
  button("Cancel send").click(); await walletLogin(); button("Sign cancellation").click();
  await vi.waitFor(() => expect(f.data.attachCancellation).toHaveBeenCalledWith("send_1", hash));
  expect(f.wallet.sendCancellation).toHaveBeenCalledWith(expect.objectContaining({ nonce: 7 }), fee, expect.any(Function));
  expect(f.wallet.sendTransfer).not.toHaveBeenCalled();
});

test("settled unverified has no signing action, but accepts a late verified hash", async () => {
  const f = fixture({ initial: { ...existing, status: "settled_unverified" } }); mount(f.dependencies);
  await vi.waitFor(() => expect(text()).toContain("could not be verified"));
  expect(text()).not.toContain("Try send again");
  await type("Transaction hash", hash);
  button("Check transfer hash").click();
  await vi.waitFor(() => expect(f.data.attachTransfer).toHaveBeenCalledWith("send_1", hash));
  expect(f.wallet.sendTransfer).not.toHaveBeenCalled();
});

test("an unknown pending transaction can be attached by its verified hash", async () => {
  const f = fixture({ initial: { ...existing, status: "pending" } }); mount(f.dependencies);
  await vi.waitFor(() => expect(text()).toContain("network is still checking this send"));
  expect(text()).not.toContain("Replace with higher fee");
  await type("Transaction hash", hash);
  button("Check transfer hash").click();
  await vi.waitFor(() => expect(f.data.attachTransfer).toHaveBeenCalledWith("send_1", hash));
  expect(f.wallet.sendTransfer).not.toHaveBeenCalled();
});

test("a status change during fee review prevents signing", async () => {
  const f = fixture({ initial: existing }); mount(f.dependencies);
  await vi.waitFor(() => expect(text()).toContain("recorded transaction number"));
  button("Try send again").click(); await walletLogin();
  f.setRecord({ ...existing, status: "confirmed" });
  button("Send winnings").click();
  await vi.waitFor(() => expect(text()).toContain("The send status changed"));
  expect(f.wallet.sendTransfer).not.toHaveBeenCalled();
});

test("a recorded status stays visible when the persona wallet cannot be resolved", async () => {
  const f = fixture({ initial: { ...existing, status: "confirmed", transaction_hashes: [hash] }, senderFails: true });
  mount(f.dependencies);
  await vi.waitFor(() => expect(text()).toContain("This send is confirmed"));
  expect(f.wallet.sendTransfer).not.toHaveBeenCalled();
});

test("send entry appears only on paid winnings and opens the sheet", async () => {
  const f = fixture();
  const held: RewardCredit = { ...paid, credit_id: "credit_held", state: "credited", claim: { status: "unclaimed", payout_status: null } };
  const paying: RewardCredit = { ...paid, credit_id: "credit_paying", state: "payout_pending", claim: { status: "accepted", payout_status: "submitted" } };
  const element = document.createElement("div"); document.body.appendChild(element);
  const data = { credits: vi.fn(async () => ({ object: "reward_credit_list" as const, items: [held, paying, paid], next_cursor: null })), claim: vi.fn() };
  createRoot(dispose => { disposers.push(dispose); render(() => <WalletWinnings data={data} send={f.dependencies} />, element); });
  await vi.waitFor(() => expect(element.textContent).toContain("Sent to your wallet"));
  expect([...element.querySelectorAll("button")].filter(item => item.textContent === "Send")).toHaveLength(1);
  button("Send").click();
  await vi.waitFor(() => expect(text()).toContain("Send winnings"));
  expect(f.data.sender).toHaveBeenCalledWith(paid);
});
