import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { ApiClientError } from "@pirate/api-client";
import type { CommunityHnsTxtApi, HnsTxtAttachment } from "./community-hns-txt-api";
import { CommunityHnsTxtController } from "./community-hns-txt-controller";

const disposers: Array<() => void> = [];
function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot((rootDispose) => { dispose = rootDispose; solidRender(ui, container); });
  disposers.push(() => { dispose(); container.remove(); });
  return container;
}
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
  sessionStorage.removeItem("hns-txt-start:community-ambiguous");
});

const awaiting: HnsTxtAttachment = {
  attachment_intent_id: "intent-0qcm",
  root_label: "0qcm",
  status: "awaiting_txt",
  challenge: { name: "0qcm", value: "pirate-verification=nvs_example" },
  expires_at: "2026-09-28T12:00:00.000Z",
  route_href: null,
  retry_after_seconds: null,
};
const attached: HnsTxtAttachment = {
  ...awaiting,
  status: "attached",
  challenge: null,
  route_href: "/c/0qcm",
};

test("starts one TXT challenge, checks it, and restores the verified route after reload", async () => {
  let current: HnsTxtAttachment | null = null;
  const start = vi.fn(async () => { current = awaiting; return awaiting; });
  const check = vi.fn(async () => { current = attached; return attached; });
  const api: CommunityHnsTxtApi = { current: async () => current, start, check };
  const first = render(() => <CommunityHnsTxtController api={api} communityId="community-1" />);
  await vi.waitFor(() => expect(first.querySelector("[data-hns-txt-status='empty']")).not.toBeNull());
  const input = first.querySelector<HTMLInputElement>("#hns-txt-root")!;
  input.value = "0qcm";
  input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  const submit = new Event("submit", { bubbles: true, cancelable: true });
  first.querySelector("form")!.dispatchEvent(submit);
  expect(submit.defaultPrevented).toBe(true);
  expect(first.textContent).not.toContain("Enter a Handshake root name.");
  await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(first.querySelector("[data-hns-txt-value]")?.textContent).toBe(awaiting.challenge?.value));
  expect(start).toHaveBeenCalledWith("community-1", "0qcm", expect.any(String));
  [...first.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Check now")!.click();
  await vi.waitFor(() => expect(first.querySelector<HTMLAnchorElement>("a[href='/c/0qcm']")).not.toBeNull());
  expect(check).toHaveBeenCalledWith("community-1", "intent-0qcm", expect.any(String));
  disposers.pop()!();

  const reloaded = render(() => <CommunityHnsTxtController api={api} communityId="community-1" />);
  await vi.waitFor(() => expect(reloaded.querySelector<HTMLAnchorElement>("a[href='/c/0qcm']")).not.toBeNull());
  expect(reloaded.textContent).not.toContain("Start verification");
});

test("a 401 offers sign-in rather than owner access denial", async () => {
  const unauthorized = new ApiClientError(
    { code: "auth_error", name: "AuthError", retryable: false, status: 401 },
    { error: { code: "auth_error", message: "Authentication required", retryable: false } },
  );
  const api: CommunityHnsTxtApi = {
    current: async () => { throw unauthorized; },
    start: async () => { throw new Error("not called"); },
    check: async () => { throw new Error("not called"); },
  };
  const container = render(() => <CommunityHnsTxtController api={api} communityId="community-1" />);
  await vi.waitFor(() => expect(container.querySelector("[data-hns-txt-status='sign-in']")).not.toBeNull());
  expect(container.textContent).toContain("Sign in");
  expect(container.textContent).not.toContain("Owner access required");
});

test("reuses the same start key after an ambiguous response and reload", async () => {
  const start = vi.fn(async (_communityId: string, _root: string, _idempotencyKey: string) => { throw new Error("Response lost"); });
  const api: CommunityHnsTxtApi = {
    current: async () => null,
    start,
    check: async () => { throw new Error("Not called"); },
  };
  const submit = async (container: HTMLElement) => {
    await vi.waitFor(() => expect(container.querySelector("[data-hns-txt-status='empty']")).not.toBeNull());
    const input = container.querySelector<HTMLInputElement>("#hns-txt-root")!;
    input.value = "0qcm";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  };
  const first = render(() => <CommunityHnsTxtController api={api} communityId="community-ambiguous" />);
  await submit(first);
  await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(first.textContent).toContain("could not be completed"));
  disposers.pop()!();

  const reloaded = render(() => <CommunityHnsTxtController api={api} communityId="community-ambiguous" />);
  await submit(reloaded);
  await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(2));
  expect(start.mock.calls[1]?.[2]).toBe(start.mock.calls[0]?.[2]);
});
