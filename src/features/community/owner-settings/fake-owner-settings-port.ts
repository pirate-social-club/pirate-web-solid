import type {
  CommunityNamespaceSettingsPort,
  CommunityProfileDraft,
  CommunityProfileSettingsPort,
  NamespaceCommandIdempotencyKeys,
  NamespaceFamily,
  NamespaceResourceRecord,
  NamespaceSettingsSnapshot,
} from "./owner-settings-model";

const HNS_COMPLETE_RESOURCE: ReadonlyArray<NamespaceResourceRecord> = [
  { record_type: "NS", value: "ns1.pirate.", supported: true, wallet_record: { type: "NS", ns: "ns1.pirate." } },
  { record_type: "NS", value: "ns2.pirate.", supported: true, wallet_record: { type: "NS", ns: "ns2.pirate." } },
  { record_type: "TXT", value: "pirate-verification=storybook-session", supported: true, wallet_record: { type: "TXT", txt: ["pirate-verification=storybook-session"] } },
  { record_type: "DS", value: "10875 13 2 ba5d84ad6e3e7ec452a569ee2e6c447ba2b9b533de65c58e59f2f0b7f0773045", supported: true, wallet_record: { type: "DS", keyTag: 10875, algorithm: 13, digestType: 2, digest: "ba5d84ad6e3e7ec452a569ee2e6c447ba2b9b533de65c58e59f2f0b7f0773045" } },
  { record_type: "DS", value: "10875 13 4 fde2c7af467092476b5572f9ac43fbbbbe82f63f7c785af984dc5884a2dae0384519dea6982fdbd19c375756b4ebaf70", supported: true, wallet_record: { type: "DS", keyTag: 10875, algorithm: 13, digestType: 4, digest: "fde2c7af467092476b5572f9ac43fbbbbe82f63f7c785af984dc5884a2dae0384519dea6982fdbd19c375756b4ebaf70" } },
];

export const unsupportedHnsRecords: ReadonlyArray<NamespaceResourceRecord> = [
  ...HNS_COMPLETE_RESOURCE,
  { record_type: "TLSA", value: "3 1 1 2A8F…", supported: false },
];

export function namespaceIdempotencyKeys(operationId: string): NamespaceCommandIdempotencyKeys {
  return {
    acknowledge_complete_resource: `${operationId}-acknowledge-complete-resource`,
    activate: `${operationId}-activate`,
    change_namespace: `${operationId}-change-namespace`,
    poll: `${operationId}-poll`,
    restart: `${operationId}-restart`,
    select_namespace: `${operationId}-select-namespace`,
    start_verification: `${operationId}-start-verification`,
    submit_name_signature: `${operationId}-submit-name-signature`,
  };
}

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
          kind: "sign_ownership",
          expires_at: "2099-09-04T12:00:00.000Z",
          message: '["pirate-hns-root-import-v1","storybook-session","midnight"]',
          root_label: current.root_label,
        } });
      } else if (command.kind === "submit_name_signature") {
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
      } else if (command.kind === "activate") {
        current = snapshot({ ...current, generation: current.generation + 1, next_action: {
          kind: "verified",
          canonical_route: `https://app.${current.root_label}/`,
          canonical_route_label: `app.${current.root_label}`,
          fallback_route: `https://pirate.sc/c/${current.root_label}`,
          fallback_route_label: `pirate.sc/c/${current.root_label}`,
        } });
      } else {
        pollCount += 1;
        current = pollCount > 1
          ? snapshot({ ...current, generation: current.generation + 1, next_action: {
              kind: "ready_to_activate",
              app_host: `app.${current.root_label}`,
              publish_plan_sha256: "a".repeat(64),
              readiness_result_sha256: "b".repeat(64),
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
