import { describe, expect, it } from "vitest";
import { NAMES_ACTIVE, NAMES_READY, NAMES_SUSPENDED } from "./community-names-settings-fixtures";
import {
  broadNamesOfferingInput,
  namesOfferingRevisionInput,
  ownerSettingsAccessFromNamesSnapshot,
  saleNamespaceActivationInput,
  saleNamespaceRevisionInput,
} from "./community-names-settings-model";

describe("community names settings model", () => {
  it("uses the ready candidate's authority and generation fences", () => {
    const candidate = NAMES_READY.context.sale_namespace_candidates[0];
    if (candidate?.kind !== "ready_v1") throw new Error("expected ready fixture");
    expect(saleNamespaceActivationInput({ candidate, communityId: "community_midnight", idempotencyKey: "activate-names-1" })).toEqual({
      path: { communityId: "community_midnight" },
      body: {
        idempotency_key: "activate-names-1",
        namespace_authority_reference: "namespace_authority_midnight",
        expected_namespace_authority_generation: 7,
        dns_zone_activation_id: "dns_zone_midnight",
        expected_dns_zone_activation_generation: 3,
        dedicated_root_replacement_confirmed: true,
      },
    });
  });

  it("passes every server preset reference into the broad free offering", () => {
    const activation = NAMES_ACTIVE.saleNamespaces[0]!.activation;
    const command = broadNamesOfferingInput({ activation, context: NAMES_READY.context, idempotencyKey: "offer-names-1" });
    expect(command.body.terms).toMatchObject({
      label_scope: {
        reserved_labels_id: "reserved_labels_midnight",
        expected_reserved_labels_revision: 4,
        availability: { min_label_length: 8, max_label_length: 32 },
      },
      qualification_policy_id: "none_v1",
      expected_qualification_policy_revision: 2,
      pricing_id: "platform_free_handles_v1",
      expected_pricing_revision: 1,
      issuance_driver_id: "hosted_persona-local",
      expected_issuance_driver_version: "1",
    });
  });

  it("reuses the offering hash and revisions when pausing", () => {
    const offering = NAMES_ACTIVE.offerings[0]!.offering;
    const command = namesOfferingRevisionInput({ communityId: "community_midnight", idempotencyKey: "pause-names-1", offering, status: "paused" });
    expect(command.body.expected_offering_hash).toBe("offering-hash-3");
    expect(command.body.terms.expected_sale_namespace_activation_generation).toBe(2);
    expect(command.body.terms.label_scope).toMatchObject({ expected_reserved_labels_revision: 4 });
    expect(command.body.requested_status).toBe("paused");
  });

  it("reuses every namespace authority fence when resuming hosting", () => {
    const activation = NAMES_SUSPENDED.saleNamespaces[0]!.activation;
    expect(saleNamespaceRevisionInput({
      activation,
      communityId: "community_midnight",
      idempotencyKey: "resume-hosting-1",
      status: "active",
    })).toEqual({
      path: { communityId: "community_midnight", activationId: "sale_namespace_midnight" },
      body: {
        idempotency_key: "resume-hosting-1",
        expected_sale_namespace_activation_hash: "sale-namespace-hash-3",
        requested_status: "active",
        namespace_authority_reference: "namespace_authority_midnight",
        expected_namespace_authority_generation: 7,
        dns_zone_activation_id: "dns_zone_midnight",
        expected_dns_zone_activation_generation: 3,
        dedicated_root_replacement_confirmed: true,
      },
    });
  });

  it("grants only Names navigation after the owner-only management read succeeds", () => {
    expect(ownerSettingsAccessFromNamesSnapshot(NAMES_READY)).toEqual({
      "community.names.manage": true,
    });
  });
});
