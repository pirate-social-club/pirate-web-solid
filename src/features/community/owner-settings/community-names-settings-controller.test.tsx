import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { ApiClientError } from "@pirate/api-client-happy-path";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { CommunityNamesSettingsApi } from "./community-names-settings-api";
import { CommunityNamesSettingsController } from "./community-names-settings-controller";
import {
  NAMES_ACTIVE,
  NAMES_READY,
  NAMES_SUSPENDED,
} from "./community-names-settings-fixtures";

const disposers: Array<() => void> = [];

function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot((rootDispose) => {
    dispose = rootDispose;
    solidRender(ui, container);
  });
  disposers.push(() => { dispose(); container.remove(); });
  return container;
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

function namesApi(overrides: Partial<CommunityNamesSettingsApi> = {}): CommunityNamesSettingsApi {
  return {
    activateSaleNamespace: async () => NAMES_ACTIVE.saleNamespaces[0]!.activation,
    createOffering: async () => undefined,
    getSnapshot: async () => NAMES_READY,
    reviseOffering: async () => undefined,
    reviseSaleNamespace: async () => undefined,
    ...overrides,
  };
}

function button(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find((item) => item.textContent?.trim() === label);
}

describe("CommunityNamesSettingsController", () => {
  test("activates a ready namespace and authors the broad free offering with stable fences", async () => {
    const activationInputs: Parameters<CommunityNamesSettingsApi["activateSaleNamespace"]>[0][] = [];
    const offeringInputs: Parameters<CommunityNamesSettingsApi["createOffering"]>[0][] = [];
    const getSnapshot = vi.fn(async () => NAMES_READY);
    const api = namesApi({
      activateSaleNamespace: async (input) => {
        activationInputs.push(input);
        return NAMES_ACTIVE.saleNamespaces[0]!.activation;
      },
      createOffering: async (input) => { offeringInputs.push(input); },
      getSnapshot,
    });
    const container = render(() => (
      <CommunityNamesSettingsController api={api} communityId="community_midnight" />
    ));

    await vi.waitFor(() => expect(button(container, "Enable names")).toBeDefined());
    button(container, "Enable names")!.click();

    await vi.waitFor(() => expect(offeringInputs).toHaveLength(1));
    expect(activationInputs[0]).toMatchObject({
      path: { communityId: "community_midnight" },
      body: {
        expected_namespace_authority_generation: 7,
        expected_dns_zone_activation_generation: 3,
      },
    });
    expect(activationInputs[0]!.body.idempotency_key).toMatch(/^community-names:activate:midnight:7:3:/);
    expect(offeringInputs[0]).toMatchObject({
      path: { communityId: "community_midnight" },
      body: {
        terms: {
          sale_namespace_activation_id: "sale_namespace_midnight",
          expected_sale_namespace_activation_generation: 2,
          label_scope: { availability: { min_label_length: 8, max_label_length: 32 } },
        },
      },
    });
    expect(offeringInputs[0]!.body.idempotency_key).toMatch(/^community-names:offer:sale_namespace_midnight:2:/);
    await vi.waitFor(() => expect(getSnapshot).toHaveBeenCalledTimes(2));
  });

  test("pauses the broad offering with its current hash and refreshes server state", async () => {
    const revisionInputs: Parameters<CommunityNamesSettingsApi["reviseOffering"]>[0][] = [];
    const getSnapshot = vi.fn(async () => NAMES_ACTIVE);
    const container = render(() => (
      <CommunityNamesSettingsController
        api={namesApi({
          getSnapshot,
          reviseOffering: async (input) => { revisionInputs.push(input); },
        })}
        communityId="community_midnight"
      />
    ));

    await vi.waitFor(() => expect(button(container, "Pause names")).toBeDefined());
    button(container, "Pause names")!.click();

    await vi.waitFor(() => expect(revisionInputs).toHaveLength(1));
    expect(revisionInputs[0]).toMatchObject({
      path: { communityId: "community_midnight", offeringId: "offering_midnight_free" },
      body: { expected_offering_hash: "offering-hash-3", requested_status: "paused" },
    });
    expect(revisionInputs[0]!.body.idempotency_key).toMatch(/^community-names:offering:offering_midnight_free:offering-hash-3:paused:/);
    await vi.waitFor(() => expect(getSnapshot).toHaveBeenCalledTimes(2));
  });

  test("resumes suspended hosting through the sale-namespace revision endpoint", async () => {
    const revisionInputs: Parameters<CommunityNamesSettingsApi["reviseSaleNamespace"]>[0][] = [];
    const container = render(() => (
      <CommunityNamesSettingsController
        api={namesApi({
          getSnapshot: async () => NAMES_SUSPENDED,
          reviseSaleNamespace: async (input) => { revisionInputs.push(input); },
        })}
        communityId="community_midnight"
      />
    ));

    await vi.waitFor(() => expect(button(container, "Resume name hosting")).toBeDefined());
    button(container, "Resume name hosting")!.click();

    await vi.waitFor(() => expect(revisionInputs).toHaveLength(1));
    expect(revisionInputs[0]).toMatchObject({
      path: { communityId: "community_midnight", activationId: "sale_namespace_midnight" },
      body: {
        expected_sale_namespace_activation_hash: "sale-namespace-hash-3",
        requested_status: "active",
      },
    });
  });

  test("fails closed when the owner-only management read is redacted", async () => {
    const notFound = new ApiClientError(
      { code: "not_found", name: "NotFound", retryable: false, status: 404 },
      { error: { code: "not_found", message: "Not found", retryable: false } },
    );
    const container = render(() => (
      <CommunityNamesSettingsController
        api={namesApi({ getSnapshot: async () => { throw notFound; } })}
        communityId="community_midnight"
      />
    ));

    await vi.waitFor(() => expect(container.querySelector("[data-owner-settings-denied]")).not.toBeNull());
    expect(container.textContent).not.toContain("Enable names");
  });
});
