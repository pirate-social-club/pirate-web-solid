import { createRoot } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, expect, test, vi } from "vitest";
import type { RewardCredit } from "../../api/reward-claim.ts";
import type { SponsoredSendRecord } from "../../api/reward-sponsored-send.ts";
import { SponsoredSendSheet, type SponsoredSendDependencies } from "./sponsored-send-sheet.tsx";
import { fixtureRecord } from "./winnings-send.fixtures.ts";

const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); });
const sender = "0x1111111111111111111111111111111111111111";
const recipient = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const credit: RewardCredit = {
  object: "reward_credit", credit_id: "credit_paid", payout_persona_id: "persona_1", chain_id: 84532,
  token_address: "0x3333333333333333333333333333333333333333", token_decimals: 6,
  amount_atomic: "1000000", available_atomic: "0", reserved_atomic: "0", paid_atomic: "1000000",
  source_kind: "megapot_allocation", state: "sent", created_at: "2026-09-28T00:00:00.000Z",
  updated_at: "2026-09-28T00:00:00.000Z", settled_at: "2026-09-28T00:00:00.000Z",
  claim: { status: "accepted", payout_status: "confirmed" }, send: null,
};
const reserved: SponsoredSendRecord = {
  object: "reward_sponsored_send", send_id: "send_1", credit_id: credit.credit_id,
  status: "reserved", chain_id: 84532, sender_address: sender,
  recipient_address: recipient, amount_atomic: "1000000", transaction_hash: null,
  authorization: { wallet_id: "wallet_1", payload_base64: "cGF5bG9hZA==" },
};

function fixture(options: { initial?: SponsoredSendRecord | null; reserveFails?: boolean; submitFails?: boolean; direct?: boolean; changeAfterReserve?: boolean } = {}) {
  let current = options.initial ?? null;
  const wallet = {
    restoreAuthorization: vi.fn(async () => true),
    signSponsoredRequest: vi.fn(async () => "c2lnbmF0dXJl"),
    dispose: vi.fn(),
  };
  const data: SponsoredSendDependencies["data"] = {
    sender: vi.fn(async () => ({ address: sender, walletIndex: 2 })),
    tokenBalance: vi.fn(async () => 1_000_000n),
    readDirectSend: vi.fn(async () => options.direct ? { ...fixtureRecord, status: "confirmed" as const } : null),
    read: vi.fn(async () => current !== null && options.changeAfterReserve
      ? { ...current, recipient_address: "0x2222222222222222222222222222222222222222" }
      : current),
    reserve: vi.fn(async (_creditId, to, amount) => {
      if (options.reserveFails) throw new Error("response_lost");
      current = { ...reserved, recipient_address: to.toLowerCase(), amount_atomic: amount };
      return current;
    }),
    submit: vi.fn(async () => {
      current = { ...current!, status: "submitting", authorization: null };
      if (options.submitFails) throw new Error("response_lost");
      return current;
    }),
  };
  const dependencies: SponsoredSendDependencies = { data, openWallet: vi.fn(async () => wallet) };
  return { dependencies, data, wallet };
}

function mount(dependencies: SponsoredSendDependencies) {
  const element = document.createElement("div"); document.body.appendChild(element);
  createRoot(dispose => { disposers.push(dispose); render(() => <SponsoredSendSheet credit={credit} dependencies={dependencies} onClose={vi.fn()} />, element); });
  return element;
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

test("reserves before signing and submits the exact signed request without a gas top-up", async () => {
  const f = fixture(); mount(f.dependencies); await review();
  expect(f.data.reserve).not.toHaveBeenCalled();
  button("Authorize send").click();
  await vi.waitFor(() => expect(f.data.submit).toHaveBeenCalledOnce());
  expect(f.data.reserve).toHaveBeenCalledWith("credit_paid", expect.any(String), "1000000", expect.any(String));
  expect(f.wallet.signSponsoredRequest).toHaveBeenCalledWith(
    expect.objectContaining({ sender, amountAtomic: "1000000", walletIndex: 2 }),
    "wallet_1", "cGF5bG9hZA==",
  );
  expect(f.data.submit).toHaveBeenCalledWith("send_1", "c2lnbmF0dXJl");
});

test("a lost reservation response never signs, even when a record exists", async () => {
  const f = fixture({ reserveFails: true }); mount(f.dependencies); await review();
  button("Authorize send").click();
  await vi.waitFor(() => expect(text()).toContain("Nothing was signed"));
  expect(f.wallet.signSponsoredRequest).not.toHaveBeenCalled();
  expect(f.data.submit).not.toHaveBeenCalled();
  expect(f.data.read).toHaveBeenCalled();
});

test("a lost submit response remains blocked across a reopened sheet", async () => {
  const f = fixture({ submitFails: true }); mount(f.dependencies); await review();
  button("Authorize send").click();
  await vi.waitFor(() => expect(text()).toContain("may have reached the network"));
  expect(f.wallet.signSponsoredRequest).toHaveBeenCalledTimes(1);
  expect(f.data.submit).toHaveBeenCalledTimes(1);
  disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren();
  mount(f.dependencies);
  await vi.waitFor(() => expect(text()).toContain("network is checking this send"));
  expect(text()).not.toContain("Authorize recorded send");
  expect(f.wallet.signSponsoredRequest).toHaveBeenCalledTimes(1);
});

test("a prior direct send blocks a second flow", async () => {
  const f = fixture({ direct: true }); mount(f.dependencies);
  await vi.waitFor(() => expect(text()).toContain("earlier wallet flow"));
  expect(text()).not.toContain("Authorize send");
  expect(f.data.reserve).not.toHaveBeenCalled();
});

test("a changed wallet or recipient record is never signed", async () => {
  const f = fixture();
  f.data.reserve = vi.fn(async () => ({ ...reserved, sender_address: "0x2222222222222222222222222222222222222222" }));
  mount(f.dependencies); await review(); button("Authorize send").click();
  await vi.waitFor(() => expect(text()).toContain("recorded send differs"));
  expect(f.wallet.signSponsoredRequest).not.toHaveBeenCalled();
  expect(f.data.submit).not.toHaveBeenCalled();
});

test("a record changed between review and authorization is never signed", async () => {
  const f = fixture({ changeAfterReserve: true }); mount(f.dependencies); await review();
  button("Authorize send").click();
  await vi.waitFor(() => expect(text()).toContain("recorded send changed"));
  expect(f.wallet.signSponsoredRequest).not.toHaveBeenCalled();
  expect(f.data.submit).not.toHaveBeenCalled();
});
