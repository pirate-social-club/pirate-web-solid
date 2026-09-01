import type {
  GetCommunitiesCommunityIdHandleSalesManagementOfferingsResponse,
  GetCommunitiesCommunityIdHandleSalesManagementResponse,
  GetCommunitiesCommunityIdHandleSalesManagementSaleNamespacesResponse,
  PirateApiClient,
  PostCommunitiesCommunityIdHandleOfferingsInput,
  PostCommunitiesCommunityIdHandleOfferingsOfferingIdRevisionsInput,
  PostCommunitiesCommunityIdHandleSaleNamespacesInput,
} from "@pirate/api-client-happy-path";

export type CommunityNamesManagementPort = Pick<
  PirateApiClient,
  | "get_communitiesCommunityIdHandleSalesManagement"
  | "get_communitiesCommunityIdHandleSalesManagementOfferings"
  | "get_communitiesCommunityIdHandleSalesManagementSaleNamespaces"
  | "post_communitiesCommunityIdHandleOfferings"
  | "post_communitiesCommunityIdHandleOfferingsOfferingIdRevisions"
  | "post_communitiesCommunityIdHandleSaleNamespaces"
  | "post_communitiesCommunityIdHandleSaleNamespacesActivationIdRevisions"
>;

export type CommunityNamesManagementContext = GetCommunitiesCommunityIdHandleSalesManagementResponse;
export type CommunityNamesCandidate = CommunityNamesManagementContext["sale_namespace_candidates"][number];
export type CommunityNamesReadyCandidate = Extract<CommunityNamesCandidate, { readonly kind: "ready_v1" }>;
export type CommunityNamesSaleNamespace = GetCommunitiesCommunityIdHandleSalesManagementSaleNamespacesResponse["items"][number];
export type CommunityNamesOffering = GetCommunitiesCommunityIdHandleSalesManagementOfferingsResponse["items"][number];

export type CommunityNamesManagementSnapshot = Readonly<{
  context: CommunityNamesManagementContext;
  offerings: ReadonlyArray<CommunityNamesOffering>;
  saleNamespaces: ReadonlyArray<CommunityNamesSaleNamespace>;
}>;

export type CommunityNamesSettingsCommand =
  | Readonly<{ candidate: CommunityNamesReadyCandidate; kind: "enable_names" }>
  | Readonly<{ kind: "pause_names"; offering: CommunityNamesOffering["offering"] }>
  | Readonly<{ kind: "resume_names"; offering: CommunityNamesOffering["offering"] }>;

export function saleNamespaceActivationInput(input: {
  candidate: CommunityNamesReadyCandidate;
  communityId: string;
  idempotencyKey: string;
}): PostCommunitiesCommunityIdHandleSaleNamespacesInput {
  return {
    path: { communityId: input.communityId },
    body: {
      idempotency_key: input.idempotencyKey,
      namespace_authority_reference: input.candidate.namespace_authority_reference,
      expected_namespace_authority_generation: input.candidate.expected_namespace_authority_generation,
      dns_zone_activation_id: input.candidate.dns_zone_activation_id,
      expected_dns_zone_activation_generation: input.candidate.expected_dns_zone_activation_generation,
      dedicated_root_replacement_confirmed: true,
    },
  };
}

export function broadNamesOfferingInput(input: {
  activation: CommunityNamesSaleNamespace["activation"];
  context: CommunityNamesManagementContext;
  idempotencyKey: string;
}): PostCommunitiesCommunityIdHandleOfferingsInput {
  const preset = input.context.offering_authoring_preset;
  return {
    path: { communityId: input.context.community_id },
    body: {
      idempotency_key: input.idempotencyKey,
      terms: {
        sale_namespace_activation_id: input.activation.sale_namespace_activation_id,
        expected_sale_namespace_activation_generation: input.activation.sale_namespace_activation_generation,
        label_scope: {
          kind: "label_rule_v2",
          label_grammar_id: "hns_ascii_ldh_1_63_v1",
          reserved_labels_id: preset.reserved_labels_id,
          expected_reserved_labels_revision: preset.expected_reserved_labels_revision,
          availability: { kind: "length_band_v1", min_label_length: 8, max_label_length: 32 },
        },
        allocation_kind: "first_come_v1",
        max_active_grants_per_account: null,
        fulfillment_kind: "hosted_persona_v1",
        qualification_policy_id: preset.broad_qualification_policy_id,
        expected_qualification_policy_revision: preset.expected_broad_qualification_policy_revision,
        pricing_id: preset.pricing_id,
        expected_pricing_revision: preset.expected_pricing_revision,
        issuance_driver_id: preset.issuance_driver_id,
        expected_issuance_driver_version: preset.expected_issuance_driver_version,
        quote_ttl_seconds: preset.quote_ttl_seconds,
        reservation_ttl_seconds: preset.reservation_ttl_seconds,
      },
    },
  };
}

function offeringTerms(offering: CommunityNamesOffering["offering"]): PostCommunitiesCommunityIdHandleOfferingsOfferingIdRevisionsInput["body"]["terms"] {
  return {
    sale_namespace_activation_id: offering.sale_namespace_activation_id,
    expected_sale_namespace_activation_generation: offering.sale_namespace_activation_generation,
    label_scope: offering.label_scope.kind === "label_rule_v2"
      ? {
          kind: "label_rule_v2",
          label_grammar_id: offering.label_scope.label_grammar_id,
          reserved_labels_id: offering.label_scope.reserved_labels_id,
          expected_reserved_labels_revision: offering.label_scope.reserved_labels_revision,
          availability: offering.label_scope.availability,
        }
      : {
          kind: "exact_label_v2",
          label_grammar_id: offering.label_scope.label_grammar_id,
          handle_label: offering.label_scope.handle_label,
          reserved_labels_id: offering.label_scope.reserved_labels_id,
          expected_reserved_labels_revision: offering.label_scope.reserved_labels_revision,
        },
    allocation_kind: offering.allocation.kind,
    max_active_grants_per_account: offering.max_active_grants_per_account,
    fulfillment_kind: offering.fulfillment.kind,
    qualification_policy_id: offering.qualification_policy.policy_id,
    expected_qualification_policy_revision: offering.qualification_policy.policy_revision,
    pricing_id: offering.pricing.pricing_id,
    expected_pricing_revision: offering.pricing.pricing_revision,
    issuance_driver_id: offering.issuance.driver_id,
    expected_issuance_driver_version: offering.issuance.driver_version,
    quote_ttl_seconds: offering.quote_ttl_seconds,
    reservation_ttl_seconds: offering.reservation_ttl_seconds,
  };
}

export function namesOfferingRevisionInput(input: {
  communityId: string;
  idempotencyKey: string;
  offering: CommunityNamesOffering["offering"];
  status: "active" | "paused";
}): PostCommunitiesCommunityIdHandleOfferingsOfferingIdRevisionsInput {
  return {
    path: { communityId: input.communityId, offeringId: input.offering.offering_id },
    body: {
      idempotency_key: input.idempotencyKey,
      expected_offering_hash: input.offering.offering_hash,
      requested_status: input.status,
      terms: offeringTerms(input.offering),
    },
  };
}
