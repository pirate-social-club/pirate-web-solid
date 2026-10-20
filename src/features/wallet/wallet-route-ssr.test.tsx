import { renderToString } from "@solidjs/web";
import { expect, test, vi } from "vitest";

import { ApplicationPersonasContext } from "../shell/application-personas.tsx";
import { WalletRouteView } from "./wallet-route.tsx";
import { ApplicationSessionProvider } from "../shell/application-session.tsx";
import * as portfolioModel from "./wallet-portfolio-model.ts";

test("Wallet renders on the server without creating a browser-only rewards client", () => {
  const markup = renderToString(() => <ApplicationPersonasContext value={{
    personas: () => [],
    selected: () => undefined,
    loading: () => false,
    unavailable: () => false,
    pickerOpen: () => false,
    setPickerOpen: () => undefined,
    select: () => undefined,
    retry: () => undefined,
  }}><WalletRouteView /></ApplicationPersonasContext>);
  expect(markup).toContain("data-route-path=\"/wallet\"");
  expect(markup).toContain("Loading wallet…");
});

test("a retained account with pending authority sends no private wallet HTML or request during SSR", () => {
  const load = vi.spyOn(portfolioModel, "loadPersonaWallets");
  try {
    const markup = renderToString(() => <ApplicationSessionProvider
      state={() => ({ status: "authenticated", userId: "account-private" })} pending={() => true}>
      <WalletRouteView />
    </ApplicationSessionProvider>);
    expect(markup).not.toContain("account-private");
    expect(markup).not.toContain("Your wallets");
    expect(markup).not.toContain("Wallet networks");
    expect(markup).not.toContain("Send USDC");
    expect(load).not.toHaveBeenCalled();
  } finally { load.mockRestore(); }
});
