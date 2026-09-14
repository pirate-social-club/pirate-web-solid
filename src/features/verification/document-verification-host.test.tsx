import { afterEach, describe, expect, test, vi } from "vitest";
import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { DocumentVerificationHost, requestDocumentVerification } from "./document-verification-host.tsx";
import type { DocumentRequirement } from "./document-requirement.ts";

const pending = (providerId: "self.pass" | "zkpassport" = "self.pass", generation = 1): DocumentRequirement => ({
  kind: "pending", requirement: "nationality", requirementHash: "requirement-hash",
  intentId: `ceremony-${generation}`, providerId, acceptedProviderIds: ["self.pass", "zkpassport"], generation,
});
const cleanups: Array<() => void> = [];
function render(ui: () => JSX.Element) {
  const container = document.createElement("div"); document.body.appendChild(container);
  createRoot(dispose => { cleanups.push(() => { dispose(); container.remove(); }); solidRender(ui, container); });
}
function button(label: string): HTMLButtonElement {
  const target = [...document.querySelectorAll("button")].find(element => element.textContent?.trim() === label);
  if (!target) throw new Error(`Missing button: ${label}`);
  return target;
}
afterEach(() => { cleanups.splice(0).forEach(dispose => dispose()); vi.restoreAllMocks(); document.body.replaceChildren(); });

describe("document verification continuation", () => {
  test("shows equal choices and requires server satisfaction after a successful SDK callback", async () => {
    let current = pending();
    const load = vi.fn(async () => current);
    const start = vi.fn(async () => {
      current = pending("zkpassport", 2);
      return { url: "https://zkpassport.id/r/test", completion: Promise.resolve(), cancel: vi.fn() };
    });
    render(() => <DocumentVerificationHost start={start} qr={async () => "data:image/png;base64,AA=="} pollIntervalMs={5} />);
    const signal = new AbortController();
    const finished = vi.fn();
    const result = requestDocumentVerification({ title: "Verify nationality to join", load, signal: signal.signal }).then(finished);
    await vi.waitFor(() => expect(button("Verify with Self").disabled).toBe(false));
    expect(button("Verify with ZKPassport").className).toBe(button("Verify with Self").className);
    button("Verify with ZKPassport").click();
    await vi.waitFor(() => expect(load.mock.calls.length).toBeGreaterThan(2));
    expect(start).toHaveBeenCalledWith("zkpassport", "ceremony-1", expect.any(AbortSignal));
    expect(finished).not.toHaveBeenCalled();
    current = { kind: "satisfied" };
    await result;
    expect(finished).toHaveBeenCalledWith(true);
  });

  test("switches using fresh server state, ignores the cancelled provider's late rejection, and aborts on route exit", async () => {
    let current = pending();
    let rejectFirst: (reason: Error) => void = () => {};
    const cancelFirst = vi.fn();
    const start = vi.fn(async (provider: string) => {
      if (provider === "self.pass") return { url: "https://redirect.self.xyz/?test", completion: new Promise<void>((_, reject) => { rejectFirst = reject; }), cancel: cancelFirst };
      current = pending("zkpassport", 2);
      return { url: "https://zkpassport.id/r/second", cancel: vi.fn() };
    });
    render(() => <DocumentVerificationHost start={start} qr={async () => "data:image/png;base64,AA=="} pollIntervalMs={5} />);
    const route = new AbortController();
    const result = requestDocumentVerification({ title: "Verify", load: async () => current, signal: route.signal });
    await vi.waitFor(() => expect(button("Verify with Self").disabled).toBe(false));
    button("Verify with Self").click();
    await vi.waitFor(() => expect(document.querySelector('a[href="https://redirect.self.xyz/?test"]')).not.toBeNull());
    button("Verify with ZKPassport").click();
    await vi.waitFor(() => expect(document.querySelector('a[href="https://zkpassport.id/r/second"]')).not.toBeNull());
    expect(cancelFirst).toHaveBeenCalledOnce();
    rejectFirst(new Error("late failure"));
    await Promise.resolve();
    expect(document.querySelector('[role="alert"]')).toBeNull();
    route.abort();
    expect(await result).toBe(false);
    expect(start.mock.calls[1]?.[0]).toBe("zkpassport");
  });

  test("never starts a provider when the authoritative requirement read fails", async () => {
    const start = vi.fn();
    render(() => <DocumentVerificationHost start={start} />);
    const controller = new AbortController();
    const result = requestDocumentVerification({ title: "Verify", signal: controller.signal, load: async () => { throw new Error("not authorized"); } });
    await vi.waitFor(() => expect(document.querySelector('[role="alert"]')).not.toBeNull());
    expect(start).not.toHaveBeenCalled();
    button("Cancel").click();
    expect(await result).toBe(false);
  });

  test("retires an expired child QR and retries with the server's replacement without granting access", async () => {
    let current = pending();
    const cancel = vi.fn();
    const load = vi.fn(async () => current);
    const start = vi.fn(async () => ({ url: "https://redirect.self.xyz/?test", cancel }));
    render(() => <DocumentVerificationHost start={start} qr={async () => "data:image/png;base64,AA=="} pollIntervalMs={5} />);
    const route = new AbortController();
    const finished = vi.fn();
    const result = requestDocumentVerification({ title: "Verify", load, signal: route.signal }).then(finished);
    await vi.waitFor(() => expect(button("Verify with Self").disabled).toBe(false));
    button("Verify with Self").click();
    await vi.waitFor(() => expect(load.mock.calls.length).toBeGreaterThan(3));
    current = pending("self.pass", 2);
    await vi.waitFor(() => expect(document.querySelector('[role="alert"]')).not.toBeNull());
    expect(document.querySelector("a")).toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
    expect(finished).not.toHaveBeenCalled();
    button("Verify with Self").click();
    await vi.waitFor(() => expect(start).toHaveBeenLastCalledWith("self.pass", "ceremony-2", expect.any(AbortSignal)));
    route.abort();
    await result;
    expect(finished).toHaveBeenCalledWith(false);
  });
});
