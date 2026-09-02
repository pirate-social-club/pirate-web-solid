import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ApiClientError } from "@pirate/api-client-happy-path";

import type { SessionHandleSalesApiClient } from "../../../api/handle-sales-client.ts";
import HandleStorefront, { canonicalNamesUrl } from "./handle-storefront.tsx";
import type {
  HandleStorefrontPublicSuccess,
  SupportedHandleOffering,
} from "./handle-storefront.model.ts";

const disposers: Array<() => void> = [];
const communityId = "community_123e4567-e89b-42d3-a456-426614174000";
const personaId = "persona-public-abcdef";
const offering = {
  offering_id: "offering-1",
  offering_revision: 1,
  offering_hash: "offering-hash",
  community_id: communityId,
  family: "hns",
  namespace_root: "charizard",
  display_root: "charizard",
  sale_namespace_activation_id: "activation-1",
  sale_namespace_activation_generation: 3,
  label_scope: {
    kind: "label_rule_v2",
    label_grammar_id: "hns_ascii_ldh_1_63_v1",
    reserved_labels_id: "reserved-1",
    reserved_labels_revision: 1,
    reserved_labels_hash: "reserved-hash",
    availability: { kind: "length_band_v1", min_label_length: 8, max_label_length: 32 },
  },
  allocation: { kind: "first_come_v1" },
  max_active_grants_per_account: 1,
  fulfillment: { kind: "hosted_persona_v1" },
  qualification_policy: { kind: "none_v1", policy_id: "policy-1", policy_revision: 1, policy_hash: "policy-hash" },
  pricing: { kind: "free_v1", pricing_id: "free-1", pricing_revision: 1, pricing_hash: "price-hash", atomic_amount: "0" },
  issuance: { family: "hns", driver_id: "hosted-persona-local", driver_version: "1" },
  quote_ttl_seconds: 120,
  reservation_ttl_seconds: 300,
  status: "active",
  created_at: "2026-08-26T12:00:00.000Z",
} as const satisfies SupportedHandleOffering;

function publicState(
  offerings: readonly SupportedHandleOffering[] = [offering],
  canonicalOrigin = location.origin,
): HandleStorefrontPublicSuccess {
  return {
    kind: "success",
    status: 200,
    community: {
      kind: "success",
      status: 200,
      requestedPathSegment: "charizard",
      canonicalPath: "/c/charizard",
      canonicalUrl: `${canonicalOrigin}/c/charizard`,
      communityId,
      routeFamily: "hns",
      routeDisplay: "charizard",
      community: {
        displayName: "Charizard",
        description: null,
        membershipMode: "open",
        memberCount: 12,
        followerCount: 20,
        rules: [],
      },
    },
    offerings,
  };
}

function sessionClient(): SessionHandleSalesApiClient {
  const quote = {
    quote_id: "quote-1",
    quote_hash: "quote-hash",
    offering_id: offering.offering_id,
    offering_revision: 1,
    offering_hash: offering.offering_hash,
    sale_namespace_activation_id: offering.sale_namespace_activation_id,
    sale_namespace_activation_generation: 3,
    fulfillment: { kind: "hosted_persona_v1" as const },
    owner_persona_id: personaId,
    handle: { family: "hns" as const, namespace_root: "charizard", handle_label: "longname" },
    display_identifier: "longname.charizard",
    pricing: { kind: "free_v1" as const, pricing_id: "free-1", pricing_revision: 1, pricing_hash: "price-hash", atomic_amount: "0" as const },
    eligibility: { policy_revision: 1, policy_hash: "policy-hash", decision: "passed" as const, evidence_use_ids: [], evaluated_at: "2026-08-26T12:00:00.000Z" },
    status: "quoted" as const,
    quoted_at: "2026-08-26T12:00:00.000Z",
    expires_at: "2026-08-26T12:02:00.000Z",
  };
  const reservation = {
    reservation_id: "reservation-1",
    reservation_hash: "reservation-hash",
    quote_id: quote.quote_id,
    quote_hash: quote.quote_hash,
    offering_id: offering.offering_id,
    offering_hash: offering.offering_hash,
    sale_namespace_activation_id: offering.sale_namespace_activation_id,
    sale_namespace_activation_generation: 3,
    fulfillment: { kind: "hosted_persona_v1" as const },
    owner_persona_id: personaId,
    handle: quote.handle,
    status: "reserved" as const,
    reserved_at: "2026-08-26T12:00:00.000Z",
    expires_at: "2026-08-26T12:05:00.000Z",
  };
  const grant = {
    grant_id: "grant-1",
    grant_generation: 1,
    community_id: communityId,
    offering_id: offering.offering_id,
    offering_hash: offering.offering_hash,
    claim_id: "claim-1",
    owner_persona_id: personaId,
    sale_namespace_activation_id: offering.sale_namespace_activation_id,
    sale_namespace_activation_generation: 3,
    fulfillment: { kind: "hosted_persona_v1" as const },
    handle: quote.handle,
    display_identifier: quote.display_identifier,
    status: "active" as const,
    issued_at: "2026-08-26T12:00:01.000Z",
  };
  const claim = {
    claim_id: "claim-1",
    owner_persona_id: personaId,
    offering_id: offering.offering_id,
    offering_hash: offering.offering_hash,
    quote_id: quote.quote_id,
    reservation_id: reservation.reservation_id,
    reservation_hash: reservation.reservation_hash,
    sale_namespace_activation_id: offering.sale_namespace_activation_id,
    sale_namespace_activation_generation: 3,
    fulfillment: { kind: "hosted_persona_v1" as const },
    handle: quote.handle,
    display_identifier: quote.display_identifier,
    payment: { kind: "not_required_v1" as const, pricing_revision: 1, pricing_hash: "price-hash", atomic_amount: "0" as const, status: "not_applicable" as const },
    state: "issued" as const,
    safe_reason: null,
    grant,
    created_at: "2026-08-26T12:00:00.000Z",
    updated_at: "2026-08-26T12:00:01.000Z",
  };
  return {
    get_personas: vi.fn(async () => ({ personas: [{
      persona_id: personaId,
      object: "persona",
      status: "active",
      profile: {
        persona_id: personaId,
        object: "persona_profile",
        revision: 1,
        display_name: "Captain",
        avatar_ref: null,
        cover_ref: null,
        bio: null,
        preferred_locale: null,
        primary_public_handle: "captain.pirate",
      },
      wallet_set: { evm: { chain_account_kind: "evm", hd_wallet_index: 4, address: "0xprivate", assigned_at: "2026-08-26T11:00:00.000Z" } },
      created_at: "2026-08-26T10:00:00.000Z",
      retired_at: null,
    }] } as const)),
    post_handlePersonaLinkConfirmations: vi.fn(async () => ({
      confirmation_id: "confirmation-1",
      confirmation_hash: "confirmation-hash",
      persona_id: personaId,
      offering_id: offering.offering_id,
      target_community_id: communityId,
      family: "hns",
      namespace_root: "charizard",
      public_linkage_generation: 4,
      persona_public_identity_digest: "persona-digest",
      status: "available",
      confirmed_at: "2026-08-26T12:00:00.000Z",
      expires_at: "2026-08-26T12:10:00.000Z",
      replayed: false,
    } as const)),
    post_handleQuotes: vi.fn(async () => ({ kind: "quoted", quote, replayed: false } as const)),
    post_handleReservations: vi.fn(async () => ({ reservation, replayed: false } as const)),
    post_handleClaims: vi.fn(async () => ({ claim, replayed: false } as const)),
    get_handleClaimsClaimId: vi.fn(async () => claim),
  };
}

function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot(rootDispose => {
    dispose = rootDispose;
    solidRender(ui, container);
  });
  disposers.push(() => { dispose(); container.remove(); });
  return container;
}

function requestError(
  reason: string,
  effectiveOfferingId?: string,
): ApiClientError {
  const details = effectiveOfferingId === undefined
    ? { reason }
    : { reason, effective_offering_id: effectiveOfferingId };
  return new ApiClientError({
    status: 409,
    code: "handle_request_rejected",
    name: "HandleRequestRejected",
    retryable: false,
  }, {
    error: {
      code: "handle_request_rejected",
      message: "redacted test error",
      retryable: false,
      details,
    },
  });
}

async function selectPersonaAndConfirm(container: HTMLElement): Promise<HTMLButtonElement> {
  const radio = await vi.waitFor(() => {
    const element = container.querySelector<HTMLInputElement>("input[type='radio']");
    if (element === null) throw new Error("persona option is required");
    return element;
  });
  radio.click();
  const checkbox = container.querySelector<HTMLInputElement>("input[type='checkbox']");
  await vi.waitFor(() => expect(checkbox?.disabled).toBe(false));
  checkbox?.click();
  return vi.waitFor(() => {
    const button = [...container.querySelectorAll("button")]
      .find(candidate => candidate.textContent?.includes("Claim longname.charizard"));
    if (button === undefined || button.disabled) throw new Error("claim button is required");
    return button;
  });
}

function confirmationKey(client: SessionHandleSalesApiClient, ordinal: number): string | undefined {
  return vi.mocked(client.post_handlePersonaLinkConfirmations).mock.calls[ordinal]?.[0]
    .body.idempotency_key;
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe("community handle storefront", () => {
  test("requires an explicit persona and public-link confirmation before the real free claim", async () => {
    const client = sessionClient();
    const container = render(() => <HandleStorefront
      pathSegment="charizard"
      initialLabel="longname"
      data={publicState()}
      sessionClient={client}
      readCsrf={() => "csrf-token"}
    />);

    await vi.waitFor(() => expect(container.querySelector<HTMLInputElement>("input[type='radio']")).not.toBeNull());
    expect(container.textContent).not.toContain("0xprivate");
    expect(container.textContent).not.toContain("hd_wallet_index");
    expect(container.querySelector<HTMLInputElement>("input[type='radio']")?.checked).toBe(false);
    const claimButton = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("Claim longname.charizard"));
    expect(claimButton?.disabled).toBe(true);

    const radio = container.querySelector<HTMLInputElement>("input[type='radio']");
    const checkbox = container.querySelector<HTMLInputElement>("input[type='checkbox']");
    radio?.click();
    await vi.waitFor(() => expect(checkbox?.disabled).toBe(false));
    checkbox?.click();
    await vi.waitFor(() => {
      expect(radio?.checked).toBe(true);
      expect(checkbox?.checked).toBe(true);
      expect([...container.querySelectorAll("button")]
        .find(button => button.textContent?.includes("Claim longname.charizard"))?.disabled).toBe(false);
    });
    [...container.querySelectorAll("button")]
      .find(button => button.textContent?.includes("Claim longname.charizard"))?.click();

    await vi.waitFor(() => expect(container.querySelector("[data-handle-claim-state='issued']")?.textContent)
      .toContain("longname.charizard"));
    expect(client.post_handlePersonaLinkConfirmations).toHaveBeenCalledTimes(1);
    expect(client.post_handleQuotes).toHaveBeenCalledTimes(1);
    expect(client.post_handleReservations).toHaveBeenCalledTimes(1);
    expect(client.post_handleClaims).toHaveBeenCalledTimes(1);
  });

  test("renders new-persona acquisition disabled and does not load a session without an offer", async () => {
    const client = sessionClient();
    const container = render(() => <HandleStorefront
      pathSegment="charizard"
      data={publicState([])}
      sessionClient={client}
      readCsrf={() => "csrf-token"}
    />);
    await vi.waitFor(() => expect(container.textContent).toContain("not offering names"));
    expect(client.get_personas).not.toHaveBeenCalled();

    const offered = render(() => <HandleStorefront
      pathSegment="charizard"
      data={publicState()}
      sessionClient={client}
      readCsrf={() => "csrf-token"}
    />);
    await vi.waitFor(() => expect([...offered.querySelectorAll("button")]
      .find(button => button.textContent?.includes("Create a separate persona"))).toBeDefined());
    expect([...offered.querySelectorAll("button")]
      .find(button => button.textContent?.includes("Create a separate persona"))?.disabled).toBe(true);
  });

  test("requires a namespace choice when the community sells under multiple roots", async () => {
    const otherOffering = {
      ...offering,
      offering_id: "offering-2",
      offering_hash: "offering-hash-2",
      sale_namespace_activation_id: "activation-2",
      namespace_root: "squirtle",
      display_root: "squirtle",
    };
    const container = render(() => <HandleStorefront
      pathSegment="charizard"
      initialLabel="longname"
      data={publicState([offering, otherOffering])}
      sessionClient={sessionClient()}
      readCsrf={() => "csrf-token"}
    />);

    const selector = await vi.waitFor(() => {
      const element = container.querySelector("#community-handle-namespace");
      if (element === null) throw new Error("namespace selector is required");
      return element;
    });
    expect(selector.querySelector("option:checked")?.getAttribute("value")).toBe("");
    expect(container.textContent).toContain("Choose a community name");
    selector.querySelector("option[value='activation-2']")?.setAttribute("selected", "selected");
    selector.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(container.textContent).toContain("Claim a name in squirtle"));
  });

  test("pins the names route to the canonical WebPKI origin", () => {
    expect(canonicalNamesUrl(publicState([offering], "https://pirate.test")))
      .toBe(`https://pirate.test/c/${communityId}/names`);
  });

  test("never loads personas when the browser origin differs from canonical metadata", async () => {
    const client = sessionClient();
    const state = publicState([offering], "https://pirate.test");
    const container = render(() => <HandleStorefront
      pathSegment={communityId}
      data={state}
      sessionClient={client}
      readCsrf={() => "csrf-token"}
    />);

    await vi.waitFor(() => expect(container.querySelector("[data-handle-storefront-canonical-only]"))
      .not.toBeNull());
    expect(client.get_personas).not.toHaveBeenCalled();
    expect(container.querySelector("[data-handle-storefront-canonical-only] a")?.getAttribute("href"))
      .toBe(`https://pirate.test/c/${communityId}/names`);
  });

  test("rotates all attempt keys after an expired quote", async () => {
    const client = sessionClient();
    vi.mocked(client.post_handleQuotes).mockRejectedValueOnce(requestError("quote_expired"));
    const container = render(() => <HandleStorefront
      pathSegment="charizard"
      initialLabel="longname"
      data={publicState()}
      sessionClient={client}
      readCsrf={() => "csrf-token"}
    />);
    const button = await selectPersonaAndConfirm(container);
    button.click();
    await vi.waitFor(() => expect(container.textContent).toContain("availability check expired"));
    const firstKey = confirmationKey(client, 0);
    button.click();
    await vi.waitFor(() => expect(container.querySelector("[data-handle-claim-state='issued']"))
      .not.toBeNull());
    expect(confirmationKey(client, 1)).not.toBe(firstKey);
  });

  test("keeps attempt keys stable after an ambiguous network failure", async () => {
    const client = sessionClient();
    vi.mocked(client.post_handleQuotes).mockRejectedValueOnce(new Error("network unavailable"));
    const container = render(() => <HandleStorefront
      pathSegment="charizard"
      initialLabel="longname"
      data={publicState()}
      sessionClient={client}
      readCsrf={() => "csrf-token"}
    />);
    const button = await selectPersonaAndConfirm(container);
    button.click();
    await vi.waitFor(() => expect(container.textContent).toContain("could not be completed"));
    const firstKey = confirmationKey(client, 0);
    button.click();
    await vi.waitFor(() => expect(container.querySelector("[data-handle-claim-state='issued']"))
      .not.toBeNull());
    expect(confirmationKey(client, 1)).toBe(firstKey);
  });

  test("uses the server-selected effective offering on a fresh retry", async () => {
    const effectiveOffering = {
      ...offering,
      offering_id: "offering-2",
      offering_hash: "offering-hash-2",
    } as const satisfies SupportedHandleOffering;
    const client = sessionClient();
    vi.mocked(client.post_handleQuotes).mockRejectedValueOnce(requestError(
      "offering_not_applicable",
      effectiveOffering.offering_id,
    ));
    const container = render(() => <HandleStorefront
      pathSegment="charizard"
      initialLabel="longname"
      data={publicState([offering, effectiveOffering])}
      sessionClient={client}
      readCsrf={() => "csrf-token"}
    />);
    const button = await selectPersonaAndConfirm(container);
    button.click();
    await vi.waitFor(() => expect(container.textContent).toContain("active offer changed"));
    button.click();
    await vi.waitFor(() => expect(client.post_handlePersonaLinkConfirmations).toHaveBeenCalledTimes(2));
    expect(vi.mocked(client.post_handlePersonaLinkConfirmations).mock.calls[1]?.[0].body.offering_id)
      .toBe(effectiveOffering.offering_id);
  });
});
