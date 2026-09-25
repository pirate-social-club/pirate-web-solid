import { render as solidRender, type JSX } from "@solidjs/web";
import { userEvent } from "@testing-library/user-event";
import { createRoot } from "solid-js";
import { ApiClientError } from "@pirate/api-client";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { CommunityNamesSettingsApi } from "./community-names-settings-api";
import { CommunityNamesSettingsController } from "./community-names-settings-controller";
import {
  NAMES_ACTIVE,
  NAMES_READY,
  NAMES_SUSPENDED,
  SPACES_YAHOO_PENDING,
  SPACES_YAHOO_READY,
} from "./community-names-settings-fixtures";

if (typeof window !== "undefined") {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.releasePointerCapture = () => {};
    Element.prototype.setPointerCapture = () => {};
  }
}

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
    activateSpacesSaleNamespace: async () => { throw new Error("not called"); },
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
  test("requires owner fee acknowledgement before opening free Spaces names", async () => {
    const activationInputs: Parameters<CommunityNamesSettingsApi["activateSpacesSaleNamespace"]>[0][] = [];
    const offeringInputs: Parameters<CommunityNamesSettingsApi["createOffering"]>[0][] = [];
    const api = namesApi({
      getSnapshot: async () => SPACES_YAHOO_READY,
      activateSpacesSaleNamespace: async (input) => {
        activationInputs.push(input);
        return { ...SPACES_YAHOO_PENDING.spaces!.saleNamespaces[0]!.activation, status: "active" };
      },
      createOffering: async (input) => { offeringInputs.push(input); },
    });
    const container = render(() => <CommunityNamesSettingsController api={api} communityId="community_midnight" />);
    await vi.waitFor(() => expect(button(container, "Enable free Spaces names")).toBeDefined());
    const enable = button(container, "Enable free Spaces names")!;
    expect(enable.disabled).toBe(true);
    await userEvent.setup().click(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    expect(enable.disabled).toBe(false);
    await userEvent.setup().click(enable);
    await vi.waitFor(() => expect(offeringInputs).toHaveLength(1));
    expect(activationInputs[0]).toMatchObject({ path: { communityId: "community_midnight" }, body: {
      family: "spaces", operator_funding_terms_confirmed: true,
      operator_assignment_id: "assignment-yahoo", expected_operator_assignment_generation: 1,
    } });
    expect(offeringInputs[0]).toMatchObject({ body: { terms: {
      label_scope: { label_grammar_id: "spaces_subspace_label_v1" },
      fulfillment_kind: "spaces_native_v1", allocation_kind: "first_come_v1",
    } } });
  });

  test("shows a Spaces-only root's private funding and disabled intake state", async () => {
    const container = render(() => <CommunityNamesSettingsController
      api={namesApi({ getSnapshot: async () => SPACES_YAHOO_PENDING })}
      communityId="community_midnight"
    />);
    await vi.waitFor(() => expect(container.querySelector('[data-spaces-names-root="yahoo"]')).not.toBeNull());
    expect(container.textContent).toContain("Names under @yahoo");
    expect(container.textContent).toContain("Operator fee balance: 0 sats");
    expect(container.textContent).toContain("Issuance is paused");
    expect(container.textContent).toContain("Name requests are not open yet");
    expect(container.textContent).not.toContain("No namespace is currently available");
    expect(button(container, "Enable names")).toBeUndefined();
  });

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


test("authors an independent nationality policy before revising the existing offering", async () => {
  const author = vi.fn(async () => ({ policy_id: "nationality-policy", policy_revision: 7 }));
  const revise = vi.fn(async () => {});
  const api = namesApi({ getSnapshot: async () => NAMES_ACTIVE, authorNationalityPolicy: author, reviseOffering: revise });
  const container = render(() => <CommunityNamesSettingsController api={api} communityId="community_midnight" />);
  await vi.waitFor(() => expect(button(container, "Change handle nationality requirement")).toBeDefined());
  button(container, "Change handle nationality requirement")!.click();
  await vi.waitFor(() => expect(container.querySelector('input[type="checkbox"]')).not.toBeNull());
  container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
  const picker = await vi.waitFor(() => {
    const found = container.querySelector<HTMLInputElement>('input[role="combobox"]');
    expect(found).not.toBeNull();
    return found!;
  });
  const user = userEvent.setup();
  await user.type(picker, "United States");
  const option = await vi.waitFor(() => {
    const found = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')]
      .find(candidate => candidate.textContent?.includes("United States"));
    expect(found).toBeDefined();
    return found!;
  });
  await user.click(option);
  button(container, "Save handle requirement")!.click();
  await vi.waitFor(() => expect(revise).toHaveBeenCalledOnce());
  expect(author).toHaveBeenCalledWith(expect.objectContaining({ communityId: "community_midnight", countries: ["US"] }));
  expect(revise).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({
    expected_offering_hash: NAMES_ACTIVE.offerings[0]!.offering.offering_hash,
    terms: expect.objectContaining({ qualification_policy_id: "nationality-policy", expected_qualification_policy_revision: 7 }),
  }) }));
});
