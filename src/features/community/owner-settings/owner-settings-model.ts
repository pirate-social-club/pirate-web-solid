export type OwnerSettingsSection =
  | "profile"
  | "namespace"
  | "names"
  | "rules"
  | "links"
  | "membership_requests"
  | "moderation"
  | "archive";

export type OwnerSettingsCapability =
  | "community.profile.write"
  | "community.namespace.write"
  | "community.names.manage"
  | "community.rules.write"
  | "community.links.write"
  | "community.membership_requests.decide"
  | "community.moderation.manage"
  | "community.archive.write";

export type OwnerSettingsAccess = Readonly<Record<OwnerSettingsCapability, boolean>>;

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
    label: "Access and safety",
    items: [
      { section: "membership_requests", capability: "community.membership_requests.decide", label: "Requests", description: "Approve or reject membership" },
      { section: "moderation", capability: "community.moderation.manage", label: "Moderation", description: "Cases, policy and actions" },
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

export type ConnectedCommunityName = Readonly<{
  address: string;
  fallbackAddress: string;
  fallbackLabel: string;
  label: string;
  providerLabel: string;
}>;

export type HnsAddState = Readonly<{
  kind:
    | "enter_name"
    | "wallet_action"
    | "transaction_pending"
    | "tree_commitment_pending"
    | "secure_connection_pending"
    | "records_mismatch"
    | "verifier_unavailable"
    | "expired";
  rootLabel: string;
}>;
