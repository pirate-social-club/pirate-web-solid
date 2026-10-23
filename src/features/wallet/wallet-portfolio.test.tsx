import { createSignal, flush } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, describe, expect, test, vi } from "vitest";
import type {} from "vitest/jsdom";
import { WalletPortfolio } from "./wallet-portfolio.tsx";
import { walletReceiveNetworks, type PersonaWallet } from "./wallet-portfolio-model.ts";
import { walletNetworkHost } from "./wallet-network-catalog.ts";
import { walletAssetSections } from "./wallet-network-catalog.ts";
import * as portfolioModel from "./wallet-portfolio-model.ts";
import * as balanceReader from "./wallet-balance-reader.ts";
import { WalletRouteView } from "./wallet-route.tsx";
import { ApplicationSessionProvider, type ApplicationSessionState } from "../shell/application-session.tsx";
import { ApplicationPersonasContext } from "../shell/application-personas.tsx";
import { rememberWalletSend, type WalletSendDraft } from "./wallet-send-continuation.ts";
import * as sponsoredSendData from "../../api/wallet-sponsored-send.ts";
import { BASE_SEPOLIA_SPONSORED_SEND, BASE_SPONSORED_SEND } from "../../api/sponsored-send-network.ts";

const disposers: (() => void)[] = [];
const initialBrowserUrl = window.location.href;
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); vi.restoreAllMocks(); jsdom.reconfigure({ url: initialBrowserUrl }); });
test("receiving uses only the selected persona address and never invents balances", async () => {
  const wallets: PersonaWallet[] = [
    { personaId: "one", displayName: "Harbor", publicHandle: null, avatarSrc: null, address: "0x1111111111111111111111111111111111111111" },
    { personaId: "two", displayName: "Night Shift", publicHandle: null, avatarSrc: null, address: "0x2222222222222222222222222222222222222222" },
  ];
  const [selected, setSelected] = createSignal("one");
  const element = document.createElement("div"); document.body.appendChild(element);
  disposers.push(render(() => <WalletPortfolio wallets={wallets} selectedPersonaId={selected()} onSelect={setSelected} onChangeProfile={() => {}} />, element));
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
  disposers.push(render(() => <WalletPortfolio
    wallets={[wallet]} selectedPersonaId="one" onSelect={() => {}} onChangeProfile={() => {}}
    networkMode="testnet" renderBaseUsdc={selected => <button type="button">Send {selected.displayName}'s winnings</button>}
  />, element));
  const send = [...element.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Send Harbor's winnings");
  expect(send?.closest("li")?.textContent).toContain("USDC");
  expect(send?.closest("section")?.getAttribute("aria-label")).toBe("Base Sepolia");
});

test("production hosts have no network switch; staging and local hosts do", () => {
  expect(walletNetworkHost("pirate.sc")).toEqual({ defaultMode: "mainnet", switchable: false });
  expect(walletNetworkHost("app.harbor")).toEqual({ defaultMode: "mainnet", switchable: false });
  expect(walletNetworkHost("web-next-staging.pirate.sc")).toEqual({ defaultMode: "testnet", switchable: true });
  expect(walletNetworkHost("localhost")).toEqual({ defaultMode: "mainnet", switchable: true });
});

test("the portfolio shows the network switch only when a handler is passed", () => {
  const wallet: PersonaWallet = {
    personaId: "one", displayName: "Harbor", publicHandle: null, avatarSrc: null,
    address: "0x1111111111111111111111111111111111111111",
  };
  const production = document.createElement("div"); document.body.appendChild(production);
  disposers.push(render(() => <WalletPortfolio
    wallets={[wallet]} selectedPersonaId="one" onSelect={() => {}} onChangeProfile={() => {}} networkMode="mainnet"
  />, production));
  expect(production.querySelector('[aria-label="Wallet networks"]')).toBeNull();
  expect([...production.querySelectorAll("button")].some(button => button.textContent === "Testnet")).toBe(false);

  const onNetworkModeChange = vi.fn();
  const staging = document.createElement("div"); document.body.appendChild(staging);
  disposers.push(render(() => <WalletPortfolio
    wallets={[wallet]} selectedPersonaId="one" onSelect={() => {}} onChangeProfile={() => {}}
    networkMode="mainnet" onNetworkModeChange={onNetworkModeChange}
  />, staging));
  [...staging.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Testnet")!.click();
  expect(onNetworkModeChange).toHaveBeenCalledWith("testnet");
});

test("the portfolio uses an accessible refresh icon and the existing wallet list for profile selection", async () => {
  const refresh = vi.fn(), select = vi.fn();
  const [loading, setLoading] = createSignal(false);
  const element = document.createElement("div"); document.body.appendChild(element);
  const wallet: PersonaWallet = { personaId: "one", displayName: "Harbor", publicHandle: null, avatarSrc: null,
    address: "0x1111111111111111111111111111111111111111" };
  disposers.push(render(() => <WalletPortfolio wallets={[wallet]} selectedPersonaId="one"
    onSelect={select} onChangeProfile={() => {}} onRefresh={refresh} balancesLoading={loading()} networkMode="testnet" />, element));
  const action = element.querySelector<HTMLButtonElement>('button[aria-label="Refresh balances"]')!;
  expect(action.textContent).toBe(""); expect(action.getAttribute("type")).toBe("button");
  action.click(); expect(refresh).toHaveBeenCalledOnce();
  setLoading(true);
  await vi.waitFor(() => expect(action.disabled).toBe(true));
  expect(action.getAttribute("aria-label")).toBe("Refresh balances"); expect(action.getAttribute("aria-busy")).toBe("true");
  expect(element.textContent).not.toContain("Switch profile");
  expect(element.textContent).not.toContain("Fiat values are unavailable");
  expect(element.textContent).not.toContain("Testnet tokens have no monetary value");
  [...element.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("Harbor") && button.closest("li"))!.click();
  expect(select).toHaveBeenCalledWith("one");
});

test("refresh cannot run without a selected receiving address", () => {
  const refresh = vi.fn(), element = document.createElement("div"); document.body.appendChild(element);
  const wallet: PersonaWallet = { personaId: "one", displayName: "Harbor", publicHandle: null, avatarSrc: null, address: null };
  disposers.push(render(() => <WalletPortfolio wallets={[wallet]} selectedPersonaId="one"
    onSelect={() => {}} onChangeProfile={() => {}} onRefresh={refresh} />, element));
  const action = element.querySelector<HTMLButtonElement>('button[aria-label="Refresh balances"]')!;
  expect(action.disabled).toBe(true); action.disabled = false; action.click(); expect(refresh).not.toHaveBeenCalled();
});

test("the actual route hides cached wallets while account authority is pending and after an account change", async () => {
  jsdom.reconfigure({ url: "https://pirate.sc/wallet" });
  const oldWallet: PersonaWallet = { personaId: "profile", displayName: "Old profile", publicHandle: null, avatarSrc: null,
    address: "0x1111111111111111111111111111111111111111" };
  const nextWallet = { ...oldWallet, displayName: "Current profile", address: "0x2222222222222222222222222222222222222222" };
  let finish: (wallets: readonly PersonaWallet[]) => void = () => { throw new Error("new account read not started"); };
  const load = vi.spyOn(portfolioModel, "loadPersonaWallets").mockResolvedValueOnce([oldWallet])
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const read = vi.spyOn(balanceReader, "readWalletBalances").mockImplementation(async (address, mode) => walletAssetSections(address, mode, "25"));
  const [account, setAccount] = createSignal<ApplicationSessionState>({ status: "authenticated", userId: "account-original" });
  const [pending, setPending] = createSignal(false);
  const element = document.createElement("div"); document.body.appendChild(element);
  disposers.push(render(() => <ApplicationSessionProvider state={account} pending={pending}>
    <ApplicationPersonasContext value={{ personas: () => [], selected: () => ({ personaId: "profile", displayName: "Selected profile" }),
      loading: () => false, unavailable: () => false, pickerOpen: () => false, setPickerOpen: () => {}, select: () => {}, retry: () => {} }}>
      <WalletRouteView />
    </ApplicationPersonasContext>
  </ApplicationSessionProvider>, element));
  await vi.waitFor(() => expect(element.textContent).toContain(oldWallet.address));
  expect(element.querySelector('[aria-label="Wallet networks"]')).toBeNull();
  setPending(true); flush();
  expect(element.textContent).not.toContain(oldWallet.address);
  setAccount({ status: "authenticated", userId: "account-current" }); setPending(false); flush();
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  expect(element.textContent).not.toContain(oldWallet.address);
  finish([nextWallet]);
  await vi.waitFor(() => expect(element.textContent).toContain(nextWallet.address));
  expect(element.textContent).not.toContain(oldWallet.address);
  expect(read).toHaveBeenCalledWith(nextWallet.address, "mainnet", expect.any(AbortSignal));
});

describe("a Palm return resumes the saved send where the serving deployment sponsors one", () => {
  const account = "account-return";
  const walletAddress = "0x3333333333333333333333333333333333333333";
  const wallet: PersonaWallet = { personaId: "profile", displayName: "Profile", publicHandle: null, avatarSrc: null,
    address: walletAddress };
  const recipient = "0x4444444444444444444444444444444444444444";
  const STAGING = "https://web-next-staging.pirate.sc";
  const PRODUCTION = "https://pirate.sc";
  afterEach(() => { delete document.documentElement.dataset.publicAppCanonicalOrigin; sessionStorage.clear(); });

  /** The actual route on `url`, served by `served`, with a draft saved before the Palm scan. */
  async function returnTo(url: string, served: string | undefined, draft: Partial<WalletSendDraft> = {}) {
    const key = crypto.randomUUID();
    rememberWalletSend({ accountId: account, personaId: wallet.personaId, walletAddress, recipient,
      amount: "0.5", idempotencyKey: key, sendId: null, ...draft });
    jsdom.reconfigure({ url: `${url}/wallet?send_return=${key}` });
    if (served !== undefined) document.documentElement.dataset.publicAppCanonicalOrigin = served;
    vi.spyOn(portfolioModel, "loadPersonaWallets").mockResolvedValue([wallet]);
    const read = vi.spyOn(balanceReader, "readWalletBalances").mockImplementation(async (address, mode) => walletAssetSections(address, mode, "25"));
    const data = vi.spyOn(sponsoredSendData, "createWalletSponsoredSendData").mockImplementation((_client, _csrf, network) => ({
      network: network!,
      sender: vi.fn(async () => ({ address: walletAddress, walletIndex: 0 })),
      tokenBalance: vi.fn(async () => 1_000_000n),
      read: vi.fn(async () => null),
      reserve: vi.fn(async () => { throw new Error("must not reserve on return"); }),
      submit: vi.fn(async () => { throw new Error("must not submit on return"); }),
      issueVerificationIntent: vi.fn(async () => "intent"),
    }));
    const select = vi.fn();
    const element = document.createElement("div"); document.body.appendChild(element);
    disposers.push(render(() => <ApplicationSessionProvider state={() => ({ status: "authenticated", userId: account })} pending={() => false}>
      <ApplicationPersonasContext value={{ personas: () => [], selected: () => ({ personaId: wallet.personaId, displayName: "Profile" }),
        loading: () => false, unavailable: () => false, pickerOpen: () => false, setPickerOpen: () => {}, select, retry: () => {} }}>
        <WalletRouteView />
      </ApplicationPersonasContext>
    </ApplicationSessionProvider>, element));
    await vi.waitFor(() => expect(element.textContent).toContain(walletAddress));
    return { element, data, read, select };
  }

  test.each([
    ["production", "https://pirate.sc", PRODUCTION, BASE_SPONSORED_SEND, "mainnet"],
    ["ordinary staging", "https://web-next-staging.pirate.sc", STAGING, BASE_SEPOLIA_SPONSORED_SEND, "testnet"],
    ["staging HNS community app", "https://app.8s28", STAGING, BASE_SEPOLIA_SPONSORED_SEND, "testnet"],
    ["staging HNS community app", "https://app.a18n", STAGING, BASE_SEPOLIA_SPONSORED_SEND, "testnet"],
  ] as const)("%s at %s resumes the saved form for review on the served network", async (_kind, url, served, network, mode) => {
    const route = await returnTo(url, served);
    await vi.waitFor(() => expect(route.element.ownerDocument.body.textContent).toContain("Wallet balance: 1 USDC"));
    expect(route.data).toHaveBeenCalledWith(undefined, undefined, network);
    expect(route.select).toHaveBeenCalledWith(wallet.personaId);
    expect(route.read).toHaveBeenLastCalledWith(walletAddress, mode, expect.any(AbortSignal));
    // The saved recipient and amount are back in the form, to be reviewed before any signing.
    const inputs = [...document.body.querySelectorAll("input")].map(input => input.value);
    expect(inputs).toEqual(expect.arrayContaining([recipient, "0.5"]));
    expect(document.body.textContent).not.toContain("could not be resumed");
  });

  test("a page that names no serving deployment resumes nothing", async () => {
    const route = await returnTo("https://app.8s28", undefined);
    expect(route.data).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Wallet balance");
  });

  test("a draft saved by another account or for another wallet is not resumed", async () => {
    for (const draft of [{ accountId: "account-other" }, { walletAddress: "0x5555555555555555555555555555555555555555" }]) {
      const route = await returnTo("https://pirate.sc", PRODUCTION, draft);
      await vi.waitFor(() => expect(route.element.textContent).toContain("Your saved send could not be resumed."));
      expect(route.data).not.toHaveBeenCalled();
      disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren(); vi.restoreAllMocks();
    }
  });
});
