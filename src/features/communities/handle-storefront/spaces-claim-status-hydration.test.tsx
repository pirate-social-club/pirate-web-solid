import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { GetHandleClaimsClaimIdResponse } from "@pirate/api-client";

import SpacesClaimStatus from "./spaces-claim-status.tsx";

// SAFETY: The status card reads only these claim fields; the remaining API fields are irrelevant to this component test.
const pending = {
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
      solidRender(() => <SpacesClaimStatus claimId="handle_claim_test" communityPath="/c/yahoo/names" client={client} />, container);
    });
    disposers.push(() => { dispose(); container.remove(); });

    await vi.waitFor(() => expect(container.textContent).toContain("Registration pending"));
    expect(get).toHaveBeenCalledWith({ path: { claimId: "handle_claim_test" } });
    const priorReads = get.mock.calls.length;
    container.querySelector<HTMLButtonElement>("button")?.click();
    await vi.waitFor(() => expect(get.mock.calls.length).toBe(priorReads + 1));
    await vi.waitFor(() => expect(container.textContent).toContain("Only you can see this requested name"));
  });
});
