import { flush } from "solid-js";
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

function mount(dependencies: WalletSponsoredSendDependencies, onConfirmed = vi.fn(), onClose = vi.fn()) {
  const element = document.createElement("div"); document.body.appendChild(element);
  const unmount = render(() => <WalletSponsoredSendSheet personaId="persona_1" walletAddress={sender} dependencies={dependencies} onClose={onClose} onConfirmed={onConfirmed} />, element);
  disposers.push(unmount);
  return unmount;
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

test("only a server-confirmed matching send notifies the parent, once per send", async () => {
  const f = fixture(), onConfirmed = vi.fn(), onClose = vi.fn();
  let current: WalletSponsoredSendRecord = { ...reserved, status: "held", authorization: null };
  vi.mocked(f.data.read).mockImplementation(async () => current);
  mount(f.dependencies, onConfirmed, onClose);
  await vi.waitFor(() => expect(text()).toContain("network is checking this send"));
  expect(onConfirmed).not.toHaveBeenCalled();
  current = { ...current, status: "confirmed", transaction_hash: `0x${"a".repeat(64)}` };
  button("Refresh status").click();
  await vi.waitFor(() => expect(onConfirmed).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(button("Refresh status").disabled).toBe(false));
  let finishRefresh: (record: WalletSponsoredSendRecord) => void = () => { throw new Error("refresh did not start"); };
  vi.mocked(f.data.read).mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve; }));
  button("Refresh status").click(); flush();
  expect(button("Refresh status").disabled).toBe(true);
  button("Close").click();
  expect(onClose).not.toHaveBeenCalled();
  finishRefresh(current);
  await vi.waitFor(() => expect(button("Refresh status").disabled).toBe(false));
  button("Close").click();
  expect(onClose).toHaveBeenCalledOnce(); expect(onConfirmed).toHaveBeenCalledOnce();
  expect(f.wallet.signSponsoredRequest).not.toHaveBeenCalled(); expect(f.data.reserve).not.toHaveBeenCalled();
});

test("closing an uncertain send is not confirmation", async () => {
  const f = fixture(), onConfirmed = vi.fn(), onClose = vi.fn();
  vi.mocked(f.data.read).mockResolvedValue({ ...reserved, status: "held", authorization: null });
  mount(f.dependencies, onConfirmed, onClose);
  await vi.waitFor(() => expect(text()).toContain("network is checking this send"));
  button("Close").click();
  expect(onClose).toHaveBeenCalledOnce(); expect(onConfirmed).not.toHaveBeenCalled();
});

test.each(["profile", "address"] as const)("a server result for another %s cannot notify this wallet", async field => {
  const f = fixture(), onConfirmed = vi.fn();
  vi.mocked(f.data.read).mockResolvedValue({ ...reserved, status: "confirmed", authorization: null,
    ...(field === "profile" ? { persona_id: "another-profile" } : { sender_address: recipient }) });
  mount(f.dependencies, onConfirmed);
  await vi.waitFor(() => expect(text()).toContain("This send is confirmed"));
  expect(onConfirmed).not.toHaveBeenCalled();
});

test("a late confirmed read after disposal cannot refresh the parent", async () => {
  const f = fixture(), onConfirmed = vi.fn();
  let finish: (value: WalletSponsoredSendRecord) => void = () => { throw new Error("read not started"); };
  vi.mocked(f.data.read).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const unmount = mount(f.dependencies, onConfirmed);
  await vi.waitFor(() => expect(f.data.read).toHaveBeenCalledOnce());
  unmount(); finish({ ...reserved, status: "confirmed", authorization: null });
  await Promise.resolve(); await Promise.resolve();
  expect(onConfirmed).not.toHaveBeenCalled();
});
