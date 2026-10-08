import { renderToString } from "@solidjs/web";
import { expect, test } from "vitest";

import { ApplicationPersonasContext } from "../shell/application-personas.tsx";
import { WalletRouteView } from "./wallet-route.tsx";

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
  expect(markup).toContain('aria-label="Loading wallet"');
});
