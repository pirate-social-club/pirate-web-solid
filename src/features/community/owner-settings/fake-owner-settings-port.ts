import type {
  CommunityNamespaceSettingsPort,
  CommunityProfileDraft,
  CommunityProfileSettingsPort,
  NamespaceFamily,
  NamespaceResourceRecord,
  NamespaceSettingsSnapshot,
} from "./owner-settings-model";

const HNS_COMPLETE_RESOURCE: ReadonlyArray<NamespaceResourceRecord> = [
  { record_type: "NS", value: "ns1.pirate.sc.", supported: true },
  { record_type: "NS", value: "ns2.pirate.sc.", supported: true },
  { record_type: "TXT", value: "pirate-verification=storybook-session", supported: true },
  { record_type: "DS", value: "49194 13 2 C74E61F29F60B98EB8A31C8A6286C1F45F418A26A42EB92C332176EA875CFDF2", supported: true },
];

export const unsupportedHnsRecords: ReadonlyArray<NamespaceResourceRecord> = [
  ...HNS_COMPLETE_RESOURCE,
  { record_type: "TLSA", value: "3 1 1 2A8F…", supported: false },
];

export function createFakeProfileSettingsPort(initial: CommunityProfileDraft): CommunityProfileSettingsPort {
  let revision = 7;
  let profile = initial;
  return {
    read: async () => ({ community_id: "community_fixture", revision, profile }),
    save: async (command) => {
      if (command.expected_revision !== revision) throw new Error("profile_revision_conflict");
      revision += 1;
      profile = command.profile;
      return { community_id: "community_fixture", revision, profile };
    },
  };
}

function snapshot(input: {
  family: NamespaceFamily | null;
  generation: number;
  next_action: NamespaceSettingsSnapshot["next_action"];
  root_label: string;
}): NamespaceSettingsSnapshot {
  return { community_id: "community_fixture", ...input };
}

export function createFakeNamespaceSettingsPort(): CommunityNamespaceSettingsPort {
  let current = snapshot({ family: null, generation: 1, root_label: "", next_action: { kind: "choose_namespace" } });
  let pollCount = 0;

  return {
    read: async () => current,
    execute: async (command) => {
      if (command.expected_generation !== current.generation) throw new Error("namespace_generation_conflict");
      if (command.kind === "change_namespace") {
        current = snapshot({ family: null, generation: current.generation + 1, root_label: "", next_action: { kind: "choose_namespace" } });
      } else if (command.kind === "select_namespace") {
        current = snapshot({
          family: command.family,
          generation: current.generation + 1,
          root_label: command.root_label,
          next_action: { kind: "start_verification", family: command.family, root_label: command.root_label },
        });
      } else if (command.kind === "start_verification") {
        current = snapshot({ ...current, generation: current.generation + 1, next_action: {
          kind: "publish_resource",
          acknowledgement_required: true,
          replacement_semantics: "complete_resource",
          records: HNS_COMPLETE_RESOURCE,
        } });
      } else if (command.kind === "acknowledge_complete_resource") {
        pollCount = 0;
        current = snapshot({ ...current, generation: current.generation + 1, next_action: { kind: "wait", reason_code: "tree_commitment_pending", retry_after_seconds: 600 } });
      } else if (command.kind === "restart") {
        pollCount = 0;
        current = snapshot({ ...current, generation: current.generation + 1, next_action: { kind: "start_verification", family: "hns", root_label: current.root_label } });
      } else {
        pollCount += 1;
        current = pollCount > 1
          ? snapshot({ ...current, generation: current.generation + 1, next_action: {
              kind: "verified",
              canonical_route: `https://app.${current.root_label}/`,
              canonical_route_label: `app.${current.root_label}`,
              fallback_route: `https://pirate.sc/c/${current.root_label}`,
              fallback_route_label: `pirate.sc/c/${current.root_label}`,
            } })
          : snapshot({ ...current, generation: current.generation + 1, next_action: { kind: "wait", reason_code: "delegation_insecure", retry_after_seconds: 60 } });
      }
      return current;
    },
  };
}

export function namespaceState(nextAction: NamespaceSettingsSnapshot["next_action"]): NamespaceSettingsSnapshot {
  return snapshot({ family: "hns", generation: 4, root_label: "midnight", next_action: nextAction });
}

export const hnsCompleteResource = HNS_COMPLETE_RESOURCE;
