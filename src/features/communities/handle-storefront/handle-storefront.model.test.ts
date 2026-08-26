import type {
  GetCommunitiesCommunityIdHandleOfferingsInput,
  GetCommunitiesCommunityIdHandleOfferingsResponse,
  GetPersonasResponse,
} from "@pirate/api-client-handle-sales";
import type {
  GetCPathSegmentResponse,
  GetCommunitiesCommunityIdPreviewResponse,
} from "@pirate/api-client-community-route";
import { describe, expect, test, vi } from "vitest";

import {
  initialHandleLabel,
  initialSaleNamespaceActivationId,
  isSupportedHandleOffering,
  loadHandleStorefrontPublic,
  normalizeDesiredHandleLabel,
  offeringAppliesToLabel,
  projectPersonaChoices,
  projectSaleNamespaceChoices,
  selectHandleOffering,
  type PublicHandleOffering,
  type SupportedHandleOffering,
} from "./handle-storefront.model.ts";

const communityId = "community_123e4567-e89b-42d3-a456-426614174000";
const route = {
  community_id: communityId,
  canonical_route: {
    family: "hns",
    root_label: "charizard",
    root_label_display: "charizard",
    path_segment: "charizard",
    href: "/c/charizard",
    app_host: "app.charizard",
  },
} as const satisfies GetCPathSegmentResponse;
const preview = {
  id: communityId,
  object: "community_preview",
  display_name: "Charizard",
  description: null,
  membership_mode: "open",
  human_verification_lane: null,
  member_count: 12,
  follower_count: 20,
  moderators: [],
  membership_gate_summaries: [],
  rules: [],
  created: 1_700_000_000,
} as const satisfies GetCommunitiesCommunityIdPreviewResponse;

function offering(
  id: string,
  labelScope: PublicHandleOffering["label_scope"],
): SupportedHandleOffering {
  return {
    offering_id: id,
    offering_revision: 1,
    offering_hash: `${id}-hash`,
    community_id: communityId,
    family: "hns",
    namespace_root: "charizard",
    display_root: "charizard",
    sale_namespace_activation_id: "activation-1",
    sale_namespace_activation_generation: 1,
    label_scope: labelScope,
    allocation: { kind: labelScope.kind === "exact_label_v2" ? "direct_grant_v1" : "first_come_v1" },
    max_active_grants_per_account: 1,
    fulfillment: { kind: "hosted_persona_v1" },
    qualification_policy: labelScope.kind === "exact_label_v2"
      ? {
          kind: "curated_policy_v1",
          policy_id: "policy-1",
          policy_revision: 1,
          policy_hash: "policy-hash",
          provider_binding_hash: "provider-hash",
        }
      : { kind: "none_v1", policy_id: "policy-1", policy_revision: 1, policy_hash: "policy-hash" },
    pricing: { kind: "free_v1", pricing_id: "free-1", pricing_revision: 1, pricing_hash: "price-hash", atomic_amount: "0" },
    issuance: { family: "hns", driver_id: "hosted-persona-local", driver_version: "1" },
    quote_ttl_seconds: 120,
    reservation_ttl_seconds: 300,
    status: "active",
    created_at: "2026-08-26T12:00:00.000Z",
  };
}

const broad = offering("offering-broad", {
  kind: "label_rule_v2",
  label_grammar_id: "hns_ascii_ldh_1_63_v1",
  reserved_labels_id: "reserved-1",
  reserved_labels_revision: 1,
  reserved_labels_hash: "reserved-hash",
  availability: { kind: "length_band_v1", min_label_length: 8, max_label_length: 32 },
});
const exact = offering("offering-exact", {
  kind: "exact_label_v2",
  label_grammar_id: "hns_ascii_ldh_1_63_v1",
  handle_label: "captain",
  reserved_labels_id: "reserved-1",
  reserved_labels_revision: 1,
  reserved_labels_hash: "reserved-hash",
});

describe("community handle storefront model", () => {
  test("keeps grammar broad while applying the offering band as availability", () => {
    expect(normalizeDesiredHandleLabel("abc")).toBe("abc");
    expect(normalizeDesiredHandleLabel("Captain")).toBeNull();
    expect(normalizeDesiredHandleLabel("bad_name")).toBeNull();
    expect(normalizeDesiredHandleLabel("bad--name")).toBeNull();
    expect(normalizeDesiredHandleLabel("xn--encoded")).toBeNull();
    expect(offeringAppliesToLabel(broad, "abcdefgh")).toBe(true);
    expect(offeringAppliesToLabel(broad, "short")).toBe(false);
    expect(offeringAppliesToLabel(exact, "captain")).toBe(true);
  });

  test("selects exact offerings before broad rules and initializes exact deep links", () => {
    expect(selectHandleOffering([broad, exact], "captain", "activation-1")?.offering_id)
      .toBe("offering-exact");
    expect(selectHandleOffering([broad, exact], "long-name", "activation-1")?.offering_id)
      .toBe("offering-broad");
    expect(initialHandleLabel([broad, exact], null, "offering-exact")).toBe("captain");
  });

  test("requires an explicit sale namespace when a community has more than one", () => {
    const other = {
      ...broad,
      offering_id: "offering-other",
      sale_namespace_activation_id: "activation-2",
      namespace_root: "squirtle",
      display_root: "squirtle",
    };
    expect(projectSaleNamespaceChoices([broad, other])).toHaveLength(2);
    expect(initialSaleNamespaceActivationId([broad, other])).toBeNull();
    expect(initialSaleNamespaceActivationId([broad, other], "offering-other")).toBe("activation-2");
    expect(selectHandleOffering([broad, other], "long-name", null)).toBeUndefined();
    expect(selectHandleOffering([broad, other], "long-name", "activation-2")?.offering_id)
      .toBe("offering-other");
  });

  test("filters unsupported families, fulfillment, auction, and inactive revisions", () => {
    const broadScope = broad.label_scope;
    if (broadScope.kind !== "label_rule_v2") throw new Error("broad fixture must use a label rule");
    expect(isSupportedHandleOffering(broad)).toBe(true);
    expect(isSupportedHandleOffering({ ...broad, status: "paused" })).toBe(false);
    expect(isSupportedHandleOffering({ ...broad, family: "spaces", issuance: { ...broad.issuance, family: "spaces" } })).toBe(false);
    expect(isSupportedHandleOffering({ ...broad, fulfillment: { kind: "delegated_zone_v1" } })).toBe(false);
    expect(isSupportedHandleOffering({ ...broad, allocation: { kind: "auction_v1" } })).toBe(false);
    expect(isSupportedHandleOffering({
      ...broad,
      label_scope: {
        ...broadScope,
        availability: { kind: "length_band_v1", min_label_length: 7, max_label_length: 32 },
      },
    })).toBe(false);
    expect(isSupportedHandleOffering({
      ...exact,
      qualification_policy: { kind: "none_v1", policy_id: "policy-1", policy_revision: 1, policy_hash: "policy-hash" },
    })).toBe(false);
  });

  test("projects only active personas without exposing wallet assignments", () => {
    const response = {
      personas: [
        {
          persona_id: "persona-public-abcdef",
          object: "persona",
          status: "active",
          profile: {
            persona_id: "persona-public-abcdef",
            object: "persona_profile",
            revision: 1,
            display_name: "Captain",
            avatar_ref: null,
            cover_ref: null,
            bio: null,
            preferred_locale: null,
            primary_public_handle: "captain.pirate",
          },
          wallet_set: { evm: { chain_account_kind: "evm", hd_wallet_index: 7, address: "0xprivate", assigned_at: "2026-08-26T12:00:00.000Z" } },
          created_at: "2026-08-26T12:00:00.000Z",
          retired_at: null,
        },
        {
          persona_id: "persona-retired",
          object: "persona",
          status: "retired",
          profile: {
            persona_id: "persona-retired",
            object: "persona_profile",
            revision: 1,
            display_name: "Old",
            avatar_ref: null,
            cover_ref: null,
            bio: null,
            preferred_locale: null,
            primary_public_handle: null,
          },
          wallet_set: { evm: null },
          created_at: "2026-08-26T12:00:00.000Z",
          retired_at: "2026-08-26T13:00:00.000Z",
        },
      ],
    } as const satisfies GetPersonasResponse;
    const projected = projectPersonaChoices(response);
    expect(projected).toEqual([{
      personaId: "persona-public-abcdef",
      displayName: "Captain",
      avatarRef: null,
      primaryPublicHandle: "captain.pirate",
      shortId: "…abcdef",
    }]);
    expect(JSON.stringify(projected)).not.toContain("0xprivate");
    expect(JSON.stringify(projected)).not.toContain("hd_wallet_index");
  });

  test("loads the canonical community and every page of its public active offerings", async () => {
    const list = vi.fn(async (
      input: GetCommunitiesCommunityIdHandleOfferingsInput,
    ): Promise<GetCommunitiesCommunityIdHandleOfferingsResponse> => input.query?.cursor === "cursor-1"
      ? {
          items: [broad, { ...exact, community_id: "community-other" }],
          next_cursor: null,
        }
      : {
          items: [{ ...exact, status: "retired" }],
          next_cursor: "cursor-1",
        });
    const state = await loadHandleStorefrontPublic({
      get_cPathSegment: async () => route,
      get_communitiesCommunityIdPreview: async () => preview,
    }, {
      get_communitiesCommunityIdHandleOfferings: list,
    }, "charizard", "https://pirate.test");
    expect(state).toMatchObject({
      kind: "success",
      community: { communityId, canonicalUrl: "https://pirate.test/c/charizard" },
      offerings: [{ offering_id: "offering-broad" }],
    });
    expect(list).toHaveBeenNthCalledWith(1, { path: { communityId }, query: { limit: "100" } });
    expect(list).toHaveBeenNthCalledWith(2, {
      path: { communityId },
      query: { limit: "100", cursor: "cursor-1" },
    });
  });
});
