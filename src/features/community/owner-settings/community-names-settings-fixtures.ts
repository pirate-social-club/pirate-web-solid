import type {
  CommunityNamesManagementContext,
  CommunityNamesManagementSnapshot,
  CommunityNamesOffering,
  CommunityNamesSaleNamespace,
  CommunitySpacesSaleNamespace,
  CommunitySpacesOffering,
} from "./community-names-settings-model";

const PRESET: Extract<CommunityNamesManagementContext["offering_authoring_presets"][number], { kind: "hns_hosted_persona_free_v1" }> = {
  kind: "hns_hosted_persona_free_v1",
  reserved_labels_id: "reserved_labels_midnight",
  expected_reserved_labels_revision: 4,
  broad_qualification_policy_id: "none_v1",
  expected_broad_qualification_policy_revision: 2,
  expected_account_directory_binding_version: "3",
  pricing_id: "platform_free_handles_v1",
  expected_pricing_revision: 1,
  issuance_driver_id: "hosted_persona-local",
  expected_issuance_driver_version: "1",
  quote_ttl_seconds: 120,
  reservation_ttl_seconds: 300,
};

const READY_CONTEXT: CommunityNamesManagementContext = {
  community_id: "community_midnight",
  sale_namespace_candidates: [{
    kind: "ready_v1",
    family: "hns",
    canonical_root: "midnight",
    display_root: "midnight",
    namespace_authority_reference: "namespace_authority_midnight",
    expected_namespace_authority_generation: 7,
    dns_zone_activation_id: "dns_zone_midnight",
    expected_dns_zone_activation_generation: 3,
  }],
  offering_authoring_presets: [PRESET],
  observed_at: "2026-09-01T12:00:00Z",
};

const ACTIVE_SALE_NAMESPACE: CommunityNamesSaleNamespace = {
  activation: {
    sale_namespace_activation_id: "sale_namespace_midnight",
    sale_namespace_activation_generation: 2,
    sale_namespace_activation_hash: "sale-namespace-hash-2",
    community_id: "community_midnight",
    family: "hns",
    canonical_root: "midnight",
    display_root: "midnight",
    namespace_authority: { kind: "verified_namespace_v1", namespace_authority_reference: "namespace_authority_midnight", namespace_authority_generation: 7 },
    serving: { kind: "hns_dns_zone_activation_v1", dns_zone_activation_id: "dns_zone_midnight", dns_zone_activation_generation: 3 },
    root_replacement: { kind: "dedicated_root_replace_v1", confirmed: true },
    status: "active",
    created_at: "2026-08-31T10:00:00Z",
    activated_at: "2026-08-31T10:01:00Z",
    suspended_at: null,
    revoked_at: null,
  },
  effectiveness: { kind: "effective_v1" },
};

const ACTIVE_OFFERING: CommunityNamesOffering = {
  offering: {
    offering_id: "offering_midnight_free",
    offering_revision: 3,
    offering_hash: "offering-hash-3",
    community_id: "community_midnight",
    family: "hns",
    namespace_root: "midnight",
    display_root: "midnight",
    sale_namespace_activation_id: "sale_namespace_midnight",
    sale_namespace_activation_generation: 2,
    label_scope: {
      kind: "label_rule_v2",
      label_grammar_id: "hns_ascii_ldh_1_63_v1",
      reserved_labels_id: "reserved_labels_midnight",
      reserved_labels_revision: 4,
      reserved_labels_hash: "reserved-labels-hash-4",
      availability: { kind: "length_band_v1", min_label_length: 8, max_label_length: 32 },
    },
    allocation: { kind: "first_come_v1" },
    max_active_grants_per_account: null,
    fulfillment: { kind: "hosted_persona_v1" },
    qualification_policy: { kind: "none_v1", policy_id: "none_v1", policy_revision: 2, policy_hash: "qualification-hash-2" },
    pricing: { kind: "free_v1", pricing_id: "platform_free_handles_v1", pricing_revision: 1, pricing_hash: "pricing-hash-1", atomic_amount: "0" },
    issuance: { family: "hns", driver_id: "hosted_persona-local", driver_version: "1" },
    quote_ttl_seconds: 120,
    reservation_ttl_seconds: 300,
    status: "active",
    created_at: "2026-08-31T10:02:00Z",
  },
  effectiveness: { kind: "effective_v1" },
};

export const NAMES_READY: CommunityNamesManagementSnapshot = { context: READY_CONTEXT, saleNamespaces: [], offerings: [] };
export const NAMES_ACTIVE: CommunityNamesManagementSnapshot = { context: READY_CONTEXT, saleNamespaces: [ACTIVE_SALE_NAMESPACE], offerings: [ACTIVE_OFFERING] };
const SPACES_YAHOO: CommunitySpacesSaleNamespace = {
  activation: {
    sale_namespace_activation_id: "spaces-yahoo",
    sale_namespace_activation_generation: 1,
    sale_namespace_activation_hash: "activation-hash",
    community_id: "community_midnight",
    family: "spaces",
    network: "mainnet",
    canonical_root: "yahoo",
    display_root: "yahoo",
    namespace_authority: { kind: "verified_namespace_v1", namespace_authority_reference: "authority-yahoo", namespace_authority_generation: 1 },
    operator: { kind: "spaces_operator_assignment_v1", operator_assignment_id: "assignment-yahoo", operator_assignment_generation: 1 },
    operator_funding_terms: { kind: "spaces_operator_funding_confirm_v1", confirmed: true },
    status: "pending",
    created_at: "2026-09-25T00:00:00Z",
    activated_at: null,
    suspended_at: null,
    revoked_at: null,
  },
  readiness: { kind: "not_ready_v1", reason: "driver_disabled" },
  funding: { status: "commits_paused_insufficient_funds_v1", confirmed_balance_sats: "0",
    top_up_address: "bc1ptest", observed_at: "2026-09-25T00:00:00Z" },
  pending_claim_count: 0,
};
export const SPACES_YAHOO_PENDING: CommunityNamesManagementSnapshot = {
  context: { ...READY_CONTEXT, sale_namespace_candidates: [] },
  saleNamespaces: [],
  offerings: [],
  spaces: { candidates: [], offerings: [], saleNamespaces: [SPACES_YAHOO] },
};
export const SPACES_YAHOO_READY: CommunityNamesManagementSnapshot = {
  context: { ...READY_CONTEXT, sale_namespace_candidates: [], offering_authoring_presets: [
    ...READY_CONTEXT.offering_authoring_presets,
    { kind: "spaces_native_free_v1", reserved_labels_id: "spaces-reserved", expected_reserved_labels_revision: 1,
      broad_qualification_policy_id: "spaces-members", expected_broad_qualification_policy_revision: 1,
      pricing_id: "spaces-free", expected_pricing_revision: 1, issuance_driver_id: "spaces-driver",
      expected_issuance_driver_version: "1", quote_ttl_seconds: 120, reservation_ttl_seconds: 300 },
  ] },
  saleNamespaces: [],
  offerings: [],
  spaces: { candidates: [{ kind: "ready_v1", family: "spaces", network: "mainnet", canonical_root: "yahoo",
    display_root: "yahoo", namespace_authority_reference: "authority-yahoo",
    expected_namespace_authority_generation: 1, operator_assignment_id: "assignment-yahoo",
    expected_operator_assignment_generation: 1 }], offerings: [], saleNamespaces: [] },
};
const SPACES_YAHOO_OFFERING: CommunitySpacesOffering = {
  offering: {
    offering_id: "offering-yahoo-free", offering_revision: 1, offering_hash: "offering-yahoo-hash",
    community_id: "community_midnight", family: "spaces", namespace_root: "yahoo", display_root: "yahoo",
    sale_namespace_activation_id: "spaces-yahoo", sale_namespace_activation_generation: 1,
    label_scope: { kind: "label_rule_v2", label_grammar_id: "spaces_subspace_label_v1",
      reserved_labels_id: "spaces-reserved", reserved_labels_revision: 1, reserved_labels_hash: "reserved-hash",
      availability: { kind: "length_band_v1", min_label_length: 8, max_label_length: 32 } },
    allocation: { kind: "first_come_v1" }, max_active_grants_per_account: null,
    fulfillment: { kind: "spaces_native_v1" },
    qualification_policy: { kind: "curated_policy_v1", policy_id: "spaces-members", policy_revision: 1,
      policy_hash: "members-hash", provider_binding_hash: "binding-hash" },
    pricing: { kind: "free_v1", pricing_id: "spaces-free", pricing_revision: 1, pricing_hash: "free-hash", atomic_amount: "0" },
    issuance: { family: "spaces", driver_id: "spaces-driver", driver_version: "1" },
    quote_ttl_seconds: 120, reservation_ttl_seconds: 300, status: "active", created_at: "2026-09-25T00:00:00Z",
  },
  effectiveness: { kind: "effective_v1" },
};
export const SPACES_YAHOO_ACTIVE: CommunityNamesManagementSnapshot = {
  context: SPACES_YAHOO_READY.context,
  saleNamespaces: [], offerings: [],
  spaces: { candidates: [], offerings: [SPACES_YAHOO_OFFERING], saleNamespaces: [{
    ...SPACES_YAHOO, activation: { ...SPACES_YAHOO.activation, status: "active" },
    readiness: { kind: "ready_v1" },
    funding: { ...SPACES_YAHOO.funding, status: "funded_v1", confirmed_balance_sats: "2500" },
  }] },
};
export const SPACES_YAHOO_PAUSED: CommunityNamesManagementSnapshot = {
  ...SPACES_YAHOO_ACTIVE,
  spaces: { ...SPACES_YAHOO_ACTIVE.spaces!, offerings: [{
    ...SPACES_YAHOO_OFFERING,
    offering: { ...SPACES_YAHOO_OFFERING.offering, status: "paused" },
    effectiveness: { kind: "ineffective_v1", reason: "offering_inactive" },
  }] },
};
export const NAMES_ACTIVATION_PENDING: CommunityNamesManagementSnapshot = {
  context: READY_CONTEXT,
  saleNamespaces: [{
    ...ACTIVE_SALE_NAMESPACE,
    activation: { ...ACTIVE_SALE_NAMESPACE.activation, status: "pending", activated_at: null },
    effectiveness: { kind: "ineffective_v1", reason: "activation_inactive" },
  }],
  offerings: [],
};
export const NAMES_REVOKED: CommunityNamesManagementSnapshot = {
  context: READY_CONTEXT,
  saleNamespaces: [{
    ...ACTIVE_SALE_NAMESPACE,
    activation: {
      ...ACTIVE_SALE_NAMESPACE.activation,
      sale_namespace_activation_generation: 3,
      sale_namespace_activation_hash: "sale-namespace-hash-3",
      status: "revoked",
      revoked_at: "2026-09-01T11:00:00Z",
    },
    effectiveness: { kind: "ineffective_v1", reason: "activation_inactive" },
  }],
  offerings: [],
};
export const NAMES_SUSPENDED: CommunityNamesManagementSnapshot = {
  context: READY_CONTEXT,
  saleNamespaces: [{
    ...ACTIVE_SALE_NAMESPACE,
    activation: {
      ...ACTIVE_SALE_NAMESPACE.activation,
      sale_namespace_activation_generation: 3,
      sale_namespace_activation_hash: "sale-namespace-hash-3",
      status: "suspended",
      suspended_at: "2026-09-01T11:00:00Z",
    },
    effectiveness: { kind: "ineffective_v1", reason: "activation_inactive" },
  }],
  offerings: [ACTIVE_OFFERING],
};
export const NAMES_PAUSED: CommunityNamesManagementSnapshot = {
  context: READY_CONTEXT,
  saleNamespaces: [ACTIVE_SALE_NAMESPACE],
  offerings: [{ ...ACTIVE_OFFERING, offering: { ...ACTIVE_OFFERING.offering, offering_revision: 4, offering_hash: "offering-hash-4", status: "paused" }, effectiveness: { kind: "ineffective_v1", reason: "offering_inactive" } }],
};
export const NAMES_INEFFECTIVE: CommunityNamesManagementSnapshot = {
  context: READY_CONTEXT,
  saleNamespaces: [{ ...ACTIVE_SALE_NAMESPACE, effectiveness: { kind: "ineffective_v1", reason: "dns_or_gateway_unhealthy" } }],
  offerings: [{ ...ACTIVE_OFFERING, effectiveness: { kind: "ineffective_v1", reason: "sale_namespace_inactive" } }],
};
export const NAMES_EMPTY: CommunityNamesManagementSnapshot = { context: { ...READY_CONTEXT, sale_namespace_candidates: [] }, saleNamespaces: [], offerings: [] };

export function unavailableNames(reason: "namespace_authority_unavailable" | "dns_zone_unavailable" | "dns_delegation_required"): CommunityNamesManagementSnapshot {
  return {
    context: {
      ...READY_CONTEXT,
      sale_namespace_candidates: [{ kind: "unavailable_v1", family: "hns", canonical_root: "midnight", display_root: "midnight", reason }],
    },
    saleNamespaces: [],
    offerings: [],
  };
}
