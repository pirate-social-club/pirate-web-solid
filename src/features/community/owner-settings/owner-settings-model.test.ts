import { describe, expect, it } from "vitest";

import { createFakeNamespaceSettingsPort } from "./fake-owner-settings-port";
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
  "community.membership_requests.decide": false,
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

  it("blocks complete-resource publication when any record is unsupported", () => {
    expect(hasUnsupportedNamespaceRecords({
      kind: "publish_resource",
      acknowledgement_required: true,
      replacement_semantics: "complete_resource",
      records: [
        { record_type: "NS", value: "ns1.pirate.sc.", supported: true },
        { record_type: "TLSA", value: "3 1 1 fixture", supported: false },
      ],
    })).toBe(true);
    expect(hasUnsupportedNamespaceRecords({ kind: "wait", reason_code: "verification_pending", retry_after_seconds: 5 })).toBe(false);
  });

  it("fences namespace commands and returns a complete HNS resource", async () => {
    const port = createFakeNamespaceSettingsPort();
    const initial = await port.read();
    const selected = await port.execute({
      expected_generation: initial.generation,
      family: "hns",
      idempotency_key: "select-midnight",
      kind: "select_namespace",
      root_label: "midnight",
    });
    const resource = await port.execute({
      expected_generation: selected.generation,
      idempotency_key: "start-midnight",
      kind: "start_verification",
    });

    expect(resource.next_action.kind).toBe("publish_resource");
    if (resource.next_action.kind === "publish_resource") {
      expect(resource.next_action.replacement_semantics).toBe("complete_resource");
      expect(resource.next_action.records.some((record) => record.record_type === "DS")).toBe(true);
    }
    await expect(port.execute({
      expected_generation: initial.generation,
      idempotency_key: "stale-poll",
      kind: "poll",
    })).rejects.toThrow("namespace_generation_conflict");
  });
});
