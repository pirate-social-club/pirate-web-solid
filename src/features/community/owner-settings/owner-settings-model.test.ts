import { describe, expect, it } from "vitest";

import { createFakeNamespaceSettingsPort, namespaceIdempotencyKeys } from "./fake-owner-settings-port";
import {
  firstVisibleOwnerSettingsSection,
  hasUnsupportedNamespaceRecords,
  visibleOwnerSettingsGroups,
  type OwnerSettingsAccess,
} from "./owner-settings-model";

const PROFILE_ONLY: OwnerSettingsAccess = {
  "community.profile.write": true,
  "community.namespace.write": false,
  "community.names.manage": false,
  "community.rules.write": false,
  "community.links.write": false,
  "community.moderation.manage": false,
  "community.archive.write": false,
};

describe("owner settings model", () => {
  it("removes inaccessible items and empty groups", () => {
    expect(visibleOwnerSettingsGroups(PROFILE_ONLY)).toEqual([
      {
        label: "Community",
        items: [
          {
            section: "profile",
            capability: "community.profile.write",
            label: "Profile",
            description: "Name, description and artwork",
          },
        ],
      },
    ]);
    expect(firstVisibleOwnerSettingsSection(PROFILE_ONLY)).toBe("profile");
  });

  it("accepts a partial capability response at the boundary", () => {
    expect(firstVisibleOwnerSettingsSection({ "community.namespace.write": true })).toBe("namespace");
  });

  it("keeps the moderation queue and content policy as separate destinations", () => {
    const groups = visibleOwnerSettingsGroups({ "community.moderation.manage": true });
    expect(groups.map((group) => ({ label: group.label, sections: group.items.map((item) => item.section) }))).toEqual([
      { label: "Moderation", sections: ["moderation_queue"] },
      { label: "Access and safety", sections: ["content_policy"] },
    ]);
  });

  it("blocks complete-resource publication when any record is unsupported", () => {
    expect(hasUnsupportedNamespaceRecords({
      kind: "publish_resource",
      acknowledgement_required: true,
      replacement_semantics: "complete_resource",
      records: [
        { record_type: "NS", value: "ns1.pirate.", supported: true },
        { record_type: "TLSA", value: "3 1 1 fixture", supported: false },
      ],
    })).toBe(true);
    expect(hasUnsupportedNamespaceRecords({ kind: "wait", reason_code: "verification_pending", retry_after_seconds: 5 })).toBe(false);
  });

  it("fences namespace commands and returns a complete HNS resource", async () => {
    const port = createFakeNamespaceSettingsPort();
    const keys = namespaceIdempotencyKeys("midnight-operation");
    const initial = await port.read();
    const selected = await port.execute({
      expected_generation: initial.generation,
      family: "hns",
      idempotency_key: keys.select_namespace,
      kind: "select_namespace",
      root_label: "midnight",
    });
    const proof = await port.execute({
      expected_generation: selected.generation,
      idempotency_key: keys.start_verification,
      kind: "start_verification",
    });
    expect(proof.next_action.kind).toBe("sign_ownership");
    const resource = await port.execute({
      expected_generation: proof.generation,
      idempotency_key: keys.submit_name_signature,
      kind: "submit_name_signature",
      signature: "fixture-name-signature",
    });

    expect(resource.next_action.kind).toBe("publish_resource");
    if (resource.next_action.kind === "publish_resource") {
      expect(resource.next_action.replacement_semantics).toBe("complete_resource");
      expect(resource.next_action.records.filter((record) => record.record_type === "DS")).toHaveLength(2);
      expect(resource.next_action.records.filter((record) => record.record_type === "NS").map((record) => record.value)).toEqual(["ns1.pirate.", "ns2.pirate."]);
    }
    const observing = await port.execute({
      expected_generation: resource.generation,
      idempotency_key: keys.acknowledge_complete_resource,
      kind: "acknowledge_complete_resource",
    });
    const stillObserving = await port.execute({
      expected_generation: observing.generation,
      idempotency_key: keys.poll,
      kind: "poll",
    });
    const ready = await port.execute({
      expected_generation: stillObserving.generation,
      idempotency_key: keys.poll,
      kind: "poll",
    });
    expect(ready.next_action.kind).toBe("ready_to_activate");
    if (ready.next_action.kind === "ready_to_activate") {
      const activated = await port.execute({
        acknowledged_complete_resource_replacement: true,
        expected_generation: ready.generation,
        idempotency_key: keys.activate,
        kind: "activate",
        publish_plan_sha256: ready.next_action.publish_plan_sha256,
        readiness_result_sha256: ready.next_action.readiness_result_sha256,
      });
      expect(activated.next_action.kind).toBe("verified");
    }
    await expect(port.execute({
      expected_generation: initial.generation,
      idempotency_key: keys.poll,
      kind: "poll",
    })).rejects.toThrow("namespace_generation_conflict");
  });
});
