import { renderToString } from "@solidjs/web";
import { expect, test } from "vitest";
import { TelegramLinkingPage } from "./telegram-linking-page";
import { TelegramConnectionsPage } from "./telegram-connections-page";
test("all Telegram pages render public pending markup without browser I/O or identity data", () => {
  for (const render of [() => <TelegramLinkingPage mode="start" />, () => <TelegramLinkingPage mode="callback" />, () => <TelegramConnectionsPage />]) {
    const html = renderToString(render);
    expect(html).toContain("Please wait"); expect(html).toContain("data-route-path");
    expect(html).not.toContain("transaction_id"); expect(html).not.toContain("confirmation_display");
  }
});
