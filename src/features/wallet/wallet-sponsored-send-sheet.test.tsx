import { createRoot } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, expect, test, vi } from "vitest";
import type { WalletSponsoredSendRecord } from "../../api/wallet-sponsored-send.ts";
import { WalletSponsoredSendSheet, type WalletSponsoredSendDependencies } from "./wallet-sponsored-send-sheet.tsx";

const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); });
const sender = "0x1111111111111111111111111111111111111111";
const recipient = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const token = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const reserved: WalletSponsoredSendRecord = {
  object: "wallet_sponsored_send", send_id: "wallet_send_1", persona_id: "persona_1",
  status: "reserved", chain_id: 84532, token_address: token, sender_address: sender,
  recipient_address: recipient, amount_atomic: "1000000", transaction_hash: null,
  authorization: { wallet_id: "wallet_1", payload_base64: "cGF5bG9hZA==" },
};

function fixture(options: { reserveFails?: boolean; submitFails?: boolean; changed?: boolean } = {}) {
  let current: WalletSponsoredSendRecord | null = null;
  const wallet = {
    restoreAuthorization: vi.fn(async () => true),
    signSponsoredRequest: vi.fn(async () => "c2lnbmF0dXJl"),
    dispose: vi.fn(),
  };
  const data: WalletSponsoredSendDependencies["data"] = {
    sender: vi.fn(async () => ({ address: sender, walletIndex: 2 })),
    tokenBalance: vi.fn(async () => 1_000_000n),
    read: vi.fn(async () => current !== null && options.changed
      ? { ...current, recipient_address: "0x2222222222222222222222222222222222222222" }
      : current),
    reserve: vi.fn(async (_personaId, to, amount) => {
      current = { ...reserved, recipient_address: to.toLowerCase(), amount_atomic: amount };
      if (options.reserveFails) throw new Error("response_lost");
      return current;
    }),
    submit: vi.fn(async () => {
      current = { ...current!, status: "held", authorization: null };
      if (options.submitFails) throw new Error("response_lost");
      return current;
    }),
  };
  const dependencies: WalletSponsoredSendDependencies = { data, openWallet: vi.fn(async () => wallet) };
  return { dependencies, data, wallet };
}

function mount(dependencies: WalletSponsoredSendDependencies) {
  const element = document.createElement("div"); document.body.appendChild(element);
  createRoot(dispose => { disposers.push(dispose); render(() => <WalletSponsoredSendSheet personaId="persona_1" walletAddress={sender} dependencies={dependencies} onClose={vi.fn()} />, element); });
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
async function review() {
  await vi.waitFor(() => expect(text()).toContain("Wallet balance: 1 USDC"));
  await type("Send to", recipient);
  button("Continue").click();
  await vi.waitFor(() => expect(text()).toContain("Covered by Pirate"));
}

test("an ordinary persona wallet reserves before signing without any reward credit", async () => {
  const f = fixture(); mount(f.dependencies); await review();
  button("Authorize send").click();
  await vi.waitFor(() => expect(f.data.submit).toHaveBeenCalledOnce());
  expect(f.data.reserve).toHaveBeenCalledWith("persona_1", expect.any(String), "1000000", expect.any(String));
  expect(f.wallet.signSponsoredRequest).toHaveBeenCalledWith(
    expect.objectContaining({ sender, amountAtomic: "1000000", walletIndex: 2 }),
    "wallet_1", "cGF5bG9hZA==",
  );
});

test("lost reservation response signs nothing", async () => {
  const f = fixture({ reserveFails: true }); mount(f.dependencies); await review();
  button("Authorize send").click();
  await vi.waitFor(() => expect(text()).toContain("Nothing was signed"));
  expect(f.wallet.signSponsoredRequest).not.toHaveBeenCalled();
  expect(f.data.submit).not.toHaveBeenCalled();
});

test("uncertain submission cannot be signed again after reopening", async () => {
  const f = fixture({ submitFails: true }); mount(f.dependencies); await review();
  button("Authorize send").click();
  await vi.waitFor(() => expect(text()).toContain("may have reached the network"));
  disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren();
  mount(f.dependencies);
  await vi.waitFor(() => expect(text()).toContain("network is checking this send"));
  expect(text()).not.toContain("Authorize recorded send");
  expect(f.wallet.signSponsoredRequest).toHaveBeenCalledTimes(1);
  expect(f.data.submit).toHaveBeenCalledTimes(1);
});

test("changed server record never reaches wallet signing", async () => {
  const f = fixture({ changed: true }); mount(f.dependencies); await review();
  button("Authorize send").click();
  await vi.waitFor(() => expect(text()).toContain("recorded send changed"));
  expect(f.wallet.signSponsoredRequest).not.toHaveBeenCalled();
  expect(f.data.submit).not.toHaveBeenCalled();
});
