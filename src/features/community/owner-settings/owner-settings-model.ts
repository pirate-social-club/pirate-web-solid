export type OwnerSettingsSection =
  | "profile"
  | "namespace"
  | "names"
  | "rules"
  | "links"
  | "moderation_queue"
  | "content_policy"
  | "archive";

export type OwnerSettingsCapability =
  | "community.profile.write"
  | "community.namespace.write"
  | "community.names.manage"
  | "community.rules.write"
  | "community.links.write"
  | "community.moderation.manage"
  | "community.archive.write";

export type OwnerSettingsAccess = Readonly<Partial<Record<OwnerSettingsCapability, boolean>>>;

export type OwnerSettingsNavItem = Readonly<{
  capability: OwnerSettingsCapability;
  description: string;
  label: string;
  section: OwnerSettingsSection;
}>;

export type OwnerSettingsNavGroup = Readonly<{
  label: string;
  items: ReadonlyArray<OwnerSettingsNavItem>;
}>;

const OWNER_SETTINGS_GROUPS: ReadonlyArray<OwnerSettingsNavGroup> = [
  {
    label: "Community",
    items: [
      { section: "profile", capability: "community.profile.write", label: "Profile", description: "Name, description and artwork" },
      { section: "namespace", capability: "community.namespace.write", label: "Address", description: "Connected community name" },
      { section: "names", capability: "community.names.manage", label: "Names", description: "Member names and selling" },
      { section: "rules", capability: "community.rules.write", label: "Rules", description: "Member expectations" },
      { section: "links", capability: "community.links.write", label: "Links", description: "Community reference links" },
    ],
  },
  {
    label: "Moderation",
    items: [
      { section: "moderation_queue", capability: "community.moderation.manage", label: "Queue", description: "Reported content that needs review" },
    ],
  },
  {
    label: "Access and safety",
    items: [
      { section: "content_policy", capability: "community.moderation.manage", label: "Content policy", description: "What is allowed, reviewed or blocked" },
    ],
  },
  {
    label: "Danger zone",
    items: [
      { section: "archive", capability: "community.archive.write", label: "Archive", description: "Hide or restore this community" },
    ],
  },
];

export function visibleOwnerSettingsGroups(access: OwnerSettingsAccess): ReadonlyArray<OwnerSettingsNavGroup> {
  return OWNER_SETTINGS_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => access[item.capability]) }))
    .filter((group) => group.items.length > 0);
}

export function firstVisibleOwnerSettingsSection(access: OwnerSettingsAccess): OwnerSettingsSection | null {
  return visibleOwnerSettingsGroups(access)[0]?.items[0]?.section ?? null;
}

export type CommunityProfileDraft = Readonly<{
  avatar_url: string | null;
  cover_url: string | null;
  description: string;
  display_name: string;
}>;

export type CommunityProfileSnapshot = Readonly<{
  community_id: string;
  revision: number;
  profile: CommunityProfileDraft;
}>;

export type CommunityProfileSettingsPort = Readonly<{
  read: () => Promise<CommunityProfileSnapshot>;
  save: (command: Readonly<{
    expected_revision: number;
    idempotency_key: string;
    profile: CommunityProfileDraft;
  }>) => Promise<CommunityProfileSnapshot>;
}>;

export type NamespaceFamily = "hns";

export type HnsWalletResourceRecord =
  | Readonly<{ type: "NS"; ns: string }>
  | Readonly<{ type: "TXT"; txt: ReadonlyArray<string> }>
  | Readonly<{ type: "DS"; keyTag: number; algorithm: number; digestType: number; digest: string }>
  | Readonly<{ type: "GLUE4" | "GLUE6"; ns: string; address: string }>
  | Readonly<{ type: "SYNTH4" | "SYNTH6"; address: string }>;

export type NamespaceResourceRecord = Readonly<{
  record_type: string;
  supported: boolean;
  value: string;
  wallet_record?: HnsWalletResourceRecord;
}>;

export type NamespaceNextAction =
  | Readonly<{ kind: "choose_namespace"; no_account_import?: boolean }>
  | Readonly<{ family: NamespaceFamily; kind: "start_verification"; root_label: string }>
  | Readonly<{
      expires_at: string;
      kind: "sign_ownership";
      message: string;
      root_label: string;
    }>
  | Readonly<{
      acknowledgement_required: true;
      kind: "publish_resource";
      records: ReadonlyArray<NamespaceResourceRecord>;
      replacement_semantics: "complete_resource";
    }>
  | Readonly<{
      kind: "wait";
      reason_code: "verification_pending" | "provider_unavailable" | "tree_commitment_pending" | "delegation_insecure";
      retry_after_seconds: number;
    }>
  | Readonly<{
      kind: "repair";
      missing_records?: ReadonlyArray<NamespaceResourceRecord>;
      reason_code: "challenge_mismatch" | "resource_mismatch" | "dnssec_failure" | "delegation_failure";
      unexpected_records?: ReadonlyArray<NamespaceResourceRecord>;
    }>
  | Readonly<{
      app_host: string;
      kind: "ready_to_activate";
      publish_plan_sha256: string;
      readiness_result_sha256: string;
    }>
  | Readonly<{
      canonical_route: string;
      canonical_route_label: string;
      fallback_route: string;
      fallback_route_label: string;
      kind: "verified";
    }>
  | Readonly<{ kind: "failed"; reason_code: string; retryable: boolean }>
  | Readonly<{ kind: "expired" }>;

export type NamespaceAttachment = Readonly<{
  root_label: string;
  status: "active" | "suspended";
}>;

export type NamespaceSettingsSnapshot = Readonly<{
  attachment?: NamespaceAttachment | null;
  community_id: string;
  family: NamespaceFamily | null;
  generation: number;
  next_action: NamespaceNextAction;
  root_label: string;
}>;

type NamespaceCommandFence = Readonly<{
  expected_generation: number;
  idempotency_key: string;
}>;

export type NamespaceSettingsCommandInput =
  | Readonly<{ family: NamespaceFamily; kind: "select_namespace"; root_label: string }>
  | Readonly<{ kind: "start_verification" }>
  | Readonly<{ kind: "submit_name_signature"; signature: string }>
  | Readonly<{ kind: "acknowledge_complete_resource" }>
  | Readonly<{ kind: "poll" }>
  | Readonly<{
      acknowledged_complete_resource_replacement: true;
      kind: "activate";
      publish_plan_sha256: string;
      readiness_result_sha256: string;
    }>
  | Readonly<{ kind: "restart" }>
  | Readonly<{ kind: "change_namespace" }>;

export type NamespaceCommandIdempotencyKeys = Readonly<Record<NamespaceSettingsCommandInput["kind"], string>>;

export type NamespaceSettingsCommand = NamespaceCommandFence & NamespaceSettingsCommandInput;

export type CommunityNamespaceSettingsPort = Readonly<{
  execute: (command: NamespaceSettingsCommand) => Promise<NamespaceSettingsSnapshot>;
  read: () => Promise<NamespaceSettingsSnapshot>;
}>;

export function hasUnsupportedNamespaceRecords(action: NamespaceNextAction): boolean {
  return action.kind === "publish_resource" && action.records.some((record) => !record.supported);
}
