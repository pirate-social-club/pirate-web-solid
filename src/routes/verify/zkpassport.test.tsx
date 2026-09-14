import { afterEach, describe, expect, test, vi } from "vitest";
import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import type { PrivySessionExchange } from "../../api/privy-session.ts";
import ZkPassportVerificationRoute from "./zkpassport.tsx";
const disposers: Array<() => void> = [];
function render(ui: () => JSX.Element) {
  const container = document.createElement("div"); document.body.appendChild(container);
  let dispose = () => {};
  createRoot(cleanup => { dispose = cleanup; solidRender(ui, container); });
  const cleanup = () => { dispose(); container.remove(); };
  disposers.push(cleanup); return cleanup;
}
function exchange(): PrivySessionExchange {
  return { sendCode: vi.fn(), loginWithCode: vi.fn(), beginOAuth: vi.fn(), completeOAuth: vi.fn(), loginWithWallet: vi.fn(), register: vi.fn(), clear: vi.fn() };
}
afterEach(() => { disposers.splice(0).forEach(cleanup => cleanup()); vi.restoreAllMocks(); document.body.replaceChildren(); document.head.replaceChildren(); });
describe("ZKPassport route dependency ownership", () => {
  test("does not initialize authentication or a ceremony when configuration is unavailable", async () => {
    const auth = vi.fn(); const ceremony = vi.fn();
    render(() => <ZkPassportVerificationRoute loadConfig={async () => { throw new Error("disabled"); }} createSessionExchange={auth} createCeremony={ceremony} />);
    await vi.waitFor(() => expect(document.body.textContent).not.toContain("Loading secure configuration"));
    expect(auth).not.toHaveBeenCalled(); expect(ceremony).not.toHaveBeenCalled();
  });
  test("disposes an authentication client that resolves after its route has unmounted", async () => {
    let resolveAuth: (value: PrivySessionExchange) => void = () => {};
    const client = exchange();
    const auth = vi.fn(() => new Promise<PrivySessionExchange>(resolve => { resolveAuth = resolve; }));
    const cleanup = render(() => <ZkPassportVerificationRoute loadConfig={async () => ({ enabled: true, privyAppId: "test" })} createSessionExchange={auth} />);
    await vi.waitFor(() => expect(auth).toHaveBeenCalledOnce());
    cleanup(); resolveAuth(client);
    await vi.waitFor(() => expect(client.clear).toHaveBeenCalledOnce());
  });
});
