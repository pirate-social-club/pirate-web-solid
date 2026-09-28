import { createRoot, createSignal } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, expect, test, vi } from "vitest";
import { WalletPortfolio } from "./wallet-portfolio.tsx";
import { walletReceiveNetworks, type PersonaWallet } from "./wallet-portfolio-model.ts";

const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); });
test("receiving uses only the selected persona address and never invents balances", async () => {
  const wallets: PersonaWallet[] = [
    { personaId: "one", displayName: "Harbor", publicHandle: null, avatarSrc: null, address: "0x1111111111111111111111111111111111111111" },
    { personaId: "two", displayName: "Night Shift", publicHandle: null, avatarSrc: null, address: "0x2222222222222222222222222222222222222222" },
  ];
  const [selected, setSelected] = createSignal("one");
  const element = document.createElement("div"); document.body.appendChild(element);
  createRoot(dispose => { disposers.push(dispose); render(() => <WalletPortfolio wallets={wallets} selectedPersonaId={selected()} onSelect={setSelected} onChangeProfile={() => {}} />, element); });
  [...element.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Night Shift"))!.click();
  await vi.waitFor(() => expect(selected()).toBe("two"));
  [...element.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Receive")!.click();
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("0x22222222");
  expect(dialog.textContent).not.toContain("0x11111111");
  expect(document.body.textContent).not.toContain("$0.00");
  // The generic portfolio has no send control without an asset-specific action.
  expect([...element.querySelectorAll<HTMLButtonElement>("button")].some(button => button.textContent === "Send")).toBe(false);
  expect(walletReceiveNetworks(wallets[1]!.address).map(network => network.chainId)).toEqual(["ethereum", "data", "base"]);
});

test("testnet winning actions sit under the selected persona's Base USDC row", () => {
  const wallet: PersonaWallet = {
    personaId: "one", displayName: "Harbor", publicHandle: null, avatarSrc: null,
    address: "0x1111111111111111111111111111111111111111",
  };
  const element = document.createElement("div"); document.body.appendChild(element);
  createRoot(dispose => { disposers.push(dispose); render(() => <WalletPortfolio
    wallets={[wallet]} selectedPersonaId="one" onSelect={() => {}} onChangeProfile={() => {}}
    networkMode="testnet" renderBaseUsdc={selected => <button type="button">Send {selected.displayName}'s winnings</button>}
  />, element); });
  const send = [...element.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Send Harbor's winnings");
  expect(send?.closest("li")?.textContent).toContain("USDC");
  expect(send?.closest("section")?.getAttribute("aria-label")).toBe("Base Sepolia");
});
