import { createRoot } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, expect, test, vi } from "vitest";
import type { RewardCredit } from "../../api/reward-claim.ts";
import type { GasTopup, GasTopupRequest, WinningsSendData } from "../../api/reward-winnings-send.ts";
import { WinningsSendSheet, type WinningsSendDependencies, type WinningsSendWallet } from "./winnings-send-sheet.tsx";
import { WalletWinnings } from "./wallet-winnings.tsx";

const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).forEach((dispose) => dispose()); document.body.replaceChildren(); });

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
  claim: { status: "accepted", payout_status: "confirmed" },
};

function fixture(options: {
  gas?: GasTopupRequest | Error;
  topups?: readonly GasTopup["status"][];
  wallet?: Partial<WinningsSendWallet>;
  sender?: () => Promise<{ address: string; walletIndex: number }>;
} = {}) {
  const topups = [...(options.topups ?? ["confirmed"])];
  const data: WinningsSendData = {
    sender: vi.fn(options.sender ?? (async () => ({ address: sender, walletIndex: 2 }))),
    tokenBalance: vi.fn(async () => 20_000_000n),
    requestGasTopup: vi.fn(async (): Promise<GasTopupRequest> => {
      if (options.gas instanceof Error) throw options.gas;
      return options.gas ?? { status: "pending", topup_id: "gas-topup_1", amount_wei: "1000" };
    }),
    readGasTopup: vi.fn(async () => ({ status: topups.length > 1 ? topups.shift()! : topups[0]!, amount_wei: "1000", transaction_hash: null })),
  };
  const wallet: WinningsSendWallet = {
    sendCode: vi.fn(async () => undefined),
    loginWithCode: vi.fn(async () => undefined),
    selectTestnetFor: vi.fn(async () => undefined),
    estimateTransfer: vi.fn(async () => fee),
    sendTransfer: vi.fn(async (_t, _f, before) => { await before(); return hash; }),
    dispose: vi.fn(),
    ...options.wallet,
  };
  const dependencies: WinningsSendDependencies = {
    data, openWallet: vi.fn(async () => wallet), poll: { intervalMs: 1, timeoutMs: 3 },
  };
  return { data, wallet, dependencies };
}

function mount(dependencies: WinningsSendDependencies, onClose = vi.fn()) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  createRoot((dispose) => { disposers.push(dispose); render(() => <WinningsSendSheet credit={paid} dependencies={dependencies} onClose={onClose} />, element); });
  return onClose;
}

const text = () => document.body.textContent ?? "";
const button = (name: string) => {
  const found = [...document.body.querySelectorAll("button")].find((item) => item.textContent?.trim() === name);
  if (found === undefined) throw new Error(`No button ${name}: ${text()}`);
  return found;
};
/** Solid 2 commits signal writes after the event; let them land before the next action. */
async function type(label: string, value: string) {
  const labelled = [...document.body.querySelectorAll("label")].find((item) => item.textContent === label);
  const input = labelled?.htmlFor ? document.getElementById(labelled.htmlFor) : labelled?.parentElement?.querySelector("input");
  if (!(input instanceof HTMLInputElement)) throw new Error(`No input ${label}`);
  input.value = value;
  input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}
async function signIn() {
  await vi.waitFor(() => expect(text()).toContain("Balance: 20 USDC"));
  await type("Send to", payee);
  button("Continue").click();
  await vi.waitFor(() => expect(text()).toContain("Sign in to your wallet"));
  await type("Email for your wallet", "winner@example.test");
  button("Send code").click();
  await vi.waitFor(() => expect(text()).toContain("Code"));
  await type("Code", "123456");
  button("Continue").click();
}

test("sends paid winnings after gas arrives and shows the explorer link", async () => {
  const f = fixture({ topups: ["requested", "confirmed"] });
  mount(f.dependencies);
  await signIn();
  await vi.waitFor(() => expect(text()).toContain("Network fee"));
  expect(text()).toContain("up to 0.00006 ETH");
  expect(f.data.requestGasTopup).toHaveBeenCalledWith("credit_paid", expect.any(String));
  expect(f.wallet.selectTestnetFor).toHaveBeenCalledWith(expect.objectContaining({ sender, walletIndex: 2 }));
  button("Send 12.5 USDC").click();
  await vi.waitFor(() => expect(text()).toContain("Sent"));
  expect(f.wallet.sendTransfer).toHaveBeenCalledWith(
    { sender, token: paid.token_address, recipient: "0xABcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD", amountAtomic: "12500000", walletIndex: 2 },
    fee, expect.any(Function),
  );
  const link = document.body.querySelector("a");
  expect(link?.getAttribute("href")).toBe(`https://sepolia.basescan.org/tx/${hash}`);
});

test("refuses the sending wallet as the recipient and amounts over the balance", async () => {
  const f = fixture();
  mount(f.dependencies);
  await vi.waitFor(() => expect(text()).toContain("Balance: 20 USDC"));
  await type("Send to", sender);
  await type("Amount (USDC)", "25");
  button("Continue").click();
  await vi.waitFor(() => expect(text()).toContain("This is the wallet you are sending from"));
  expect(text()).toContain("You can send up to 20 USDC.");
  expect(f.dependencies.openWallet).not.toHaveBeenCalled();
});

test("lets the winner try with their own ETH when gas help is used up", async () => {
  const f = fixture({ gas: { status: "limit_reached", topup_id: null, amount_wei: null } });
  mount(f.dependencies);
  await signIn();
  await vi.waitFor(() => expect(text()).toContain("Gas help is used up for today, so your wallet pays this fee"));
  expect(f.data.readGasTopup).not.toHaveBeenCalled();
});

test("explains that gas help is used up when the wallet cannot pay the fee", async () => {
  const f = fixture({
    gas: { status: "limit_reached", topup_id: null, amount_wei: null },
    wallet: { estimateTransfer: vi.fn(async () => { throw new Error("wallet_insufficient_gas_balance"); }) },
  });
  mount(f.dependencies);
  await signIn();
  await vi.waitFor(() => expect(text()).toContain("Gas help is used up for today, and your wallet does not have enough ETH"));
});

test("says sending is unavailable while rewards are off", async () => {
  const f = fixture({ gas: Object.assign(new Error("Provider unavailable"), { code: "provider_unavailable" }) });
  mount(f.dependencies);
  await signIn();
  await vi.waitFor(() => expect(text()).toContain("Sending winnings is not available right now."));
  expect(f.wallet.estimateTransfer).not.toHaveBeenCalled();
  expect(text()).not.toContain("provider");
});

test("stops when the signed-in wallet is not the payout wallet", async () => {
  const f = fixture({ wallet: { selectTestnetFor: vi.fn(async () => { throw new Error("wallet_assignment_mismatch"); }) } });
  mount(f.dependencies);
  await signIn();
  await vi.waitFor(() => expect(text()).toContain("not the wallet your winnings were paid to"));
  expect(f.data.requestGasTopup).not.toHaveBeenCalled();
  expect(f.wallet.sendTransfer).not.toHaveBeenCalled();
});

test("an uncertain broadcast says it may still arrive and offers no retry", async () => {
  const f = fixture({ wallet: { sendTransfer: vi.fn(async (_t, _f, before) => { await before(); throw new Error("wallet_submission_uncertain"); }) } });
  mount(f.dependencies);
  await signIn();
  await vi.waitFor(() => expect(text()).toContain("Network fee"));
  button("Send 12.5 USDC").click();
  await vi.waitFor(() => expect(text()).toContain("It may still arrive"));
  expect(text()).not.toContain("Try again");
  expect([...document.body.querySelectorAll("button")].some((item) => item.textContent?.startsWith("Send "))).toBe(false);
});

test("a gas wait that runs long can be checked again", async () => {
  const f = fixture({ topups: ["requested", "requested", "requested", "confirmed"] });
  mount(f.dependencies);
  await signIn();
  await vi.waitFor(() => expect(text()).toContain("taking longer than usual"));
  button("Check again").click();
  await vi.waitFor(() => expect(text()).toContain("Network fee"));
  expect(f.data.requestGasTopup).toHaveBeenCalledTimes(1);
});

test("the payout wallet cannot be found", async () => {
  const f = fixture({ sender: async () => { throw new Error("winnings_sender_unavailable"); } });
  mount(f.dependencies);
  await vi.waitFor(() => expect(text()).toContain("could not be found"));
});

test("Send appears only on paid winnings and opens the sheet", async () => {
  const f = fixture();
  const held: RewardCredit = { ...paid, credit_id: "credit_held", state: "credited", claim: { status: "unclaimed", payout_status: null } };
  const paying: RewardCredit = { ...paid, credit_id: "credit_paying", state: "payout_pending", claim: { status: "accepted", payout_status: "submitted" } };
  const element = document.createElement("div");
  document.body.appendChild(element);
  const data = { credits: vi.fn(async () => ({ object: "reward_credit_list" as const, items: [held, paying, paid], next_cursor: null })), claim: vi.fn() };
  createRoot((dispose) => { disposers.push(dispose); render(() => <WalletWinnings data={data} send={f.dependencies} />, element); });
  await vi.waitFor(() => expect(element.textContent).toContain("Sent to your wallet"));
  const sends = [...element.querySelectorAll("button")].filter((item) => item.textContent === "Send");
  expect(sends).toHaveLength(1);
  expect(sends[0]?.getAttribute("aria-label")).toBe("Send 12.5 USDC");
  sends[0]!.click();
  await vi.waitFor(() => expect(text()).toContain("Send winnings"));
  expect(f.data.sender).toHaveBeenCalledWith(paid);
});
