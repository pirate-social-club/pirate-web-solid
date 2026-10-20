import { render as solidRender } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { GetHandleClaimsClaimIdResponse } from "@pirate/api-client";

import { ApplicationSessionProvider, type ApplicationSessionState } from "../../shell/application-session.tsx";
import SpacesClaimStatus from "./spaces-claim-status.tsx";

// SAFETY: The status card reads only these claim fields; the remaining API fields are irrelevant to this component test.
const pending = {
  claim_id: "handle_claim_test",
  fulfillment: { kind: "spaces_native_v1" },
  handle: { family: "spaces", namespace_root: "yahoo", handle_label: "e2e-auto-20260927" },
  display_identifier: "e2e-auto-20260927@yahoo",
  state: "issuance_pending",
  delayed: false,
  grant: null,
} as GetHandleClaimsClaimIdResponse;

const disposers: Array<() => void> = [];
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); });

describe("Spaces claim status hydration", () => {
  test("reads the private claim after mounting and refreshes it on request", async () => {
    const get = vi.fn(async () => pending);
    const client = { get_handleClaimsClaimId: get };
    const container = document.createElement("div");
    document.body.appendChild(container);
    let dispose = () => {};
    createRoot(rootDispose => {
      dispose = rootDispose;
      solidRender(() => <ApplicationSessionProvider state={() => ({ status: "authenticated", userId: "account-test" })}><SpacesClaimStatus claimId="handle_claim_test" communityPath="/c/yahoo/names" client={client} /></ApplicationSessionProvider>, container);
    });
    disposers.push(() => { dispose(); container.remove(); });

    await vi.waitFor(() => expect(container.textContent).toContain("Registration pending"));
    expect(get).toHaveBeenCalledWith({ path: { claimId: "handle_claim_test" } }, expect.objectContaining({ credentials: "same-origin", signal: expect.any(AbortSignal) }));
    const priorReads = get.mock.calls.length;
    container.querySelector<HTMLButtonElement>("button")?.click();
    await vi.waitFor(() => expect(get.mock.calls.length).toBe(priorReads + 1));
    await vi.waitFor(() => expect(container.textContent).toContain("Only you can see this requested name"));
  });
});

test("pending session changes and unmount invalidate in-flight private claim reads", async () => {
  let finish: (value: GetHandleClaimsClaimIdResponse) => void = () => {};
  const delayed = new Promise<GetHandleClaimsClaimIdResponse>(resolve => { finish = resolve; });
  const get = vi.fn(async () => pending);
  const [account, setAccount] = createSignal<ApplicationSessionState>({ status: "authenticated", userId: "account-a" });
  const [checking, setChecking] = createSignal(false);
  const element = document.createElement("div"); document.body.appendChild(element);
  let dispose = () => {};
  createRoot(done => { dispose = done; solidRender(() => <ApplicationSessionProvider state={account} pending={checking}>
    <SpacesClaimStatus claimId="handle_claim_test" communityPath="/c/original/names" client={{ get_handleClaimsClaimId: get }} />
  </ApplicationSessionProvider>, element); });
  disposers.push(() => { dispose(); element.remove(); });
  await vi.waitFor(() => expect(element.textContent).toContain("Registration pending"));
  get.mockImplementationOnce(() => delayed);
  element.querySelector("button")?.click();
  await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  setChecking(true);
  await vi.waitFor(() => expect(element.textContent).not.toContain("Registration pending"));
  setAccount("anonymous"); setChecking(false);
  await vi.waitFor(() => expect(element.textContent).toContain("Sign in to see your registration"));
  finish(pending); await Promise.resolve();
  expect(element.textContent).not.toContain("Registration pending");
  expect(get).toHaveBeenCalledTimes(2);
  dispose();
});
