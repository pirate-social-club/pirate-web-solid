// Story-owned view model for the community gate wizard exploration. Nothing
// here is an api-next contract: capabilities mirror the 2026-08-19 workspace
// gates audit, and the compiled policy is a local artifact for the review
// step. The wizard authors exactly one implicit-AND access path; a future
// advanced surface would add alternative paths instead of recursive AND/OR
// trees. Proof-of-work is deliberately absent: it is an action grant, never a
// membership check.

export type GateCheckCapability = "available" | "design-hold" | "exploration";

export type GateCheckKind =
  | "age18"
  | "nationality"
  | "gender"
  | "nft"
  | "token_balance"
  | "passport_score";

export type GateCheckCatalogMode = "production" | "exploration";

export type GateCheckCatalogEntry = {
  kind: GateCheckKind;
  capability: GateCheckCapability;
};

export const GATE_CHECK_CATALOG: readonly GateCheckCatalogEntry[] = [
  { kind: "age18", capability: "available" },
  { kind: "nationality", capability: "design-hold" },
  { kind: "gender", capability: "design-hold" },
  { kind: "nft", capability: "exploration" },
  { kind: "token_balance", capability: "exploration" },
  { kind: "passport_score", capability: "exploration" },
];

export function gateCheckCatalogEntry(kind: GateCheckKind): GateCheckCatalogEntry | null {
  return GATE_CHECK_CATALOG.find((entry) => entry.kind === kind) ?? null;
}

export function visibleGateChecks(
  mode: GateCheckCatalogMode,
): readonly GateCheckCatalogEntry[] {
  return GATE_CHECK_CATALOG.filter(
    (entry) => mode === "exploration" || entry.capability !== "exploration",
  );
}

export function isGateCheckSelectable(
  entry: GateCheckCatalogEntry,
  mode: GateCheckCatalogMode,
): boolean {
  return mode === "exploration" || entry.capability === "available";
}

export type GateWizardMembershipMode = "humans-only" | "humans-and-bots";
export type GateWizardInviteRule = "open" | "invite-required";
export type GenderMarker = "M" | "F";

export type NftCheckConfig =
  | { mode: "collection"; contractAddress: string; minCount: number }
  | { mode: "collectible"; category: string; subject: string; minQuantity: number };

export type GateWizardCheck =
  | { kind: "age18" }
  | { kind: "nationality"; allowedCountries: string[] }
  | { kind: "gender"; allowedMarkers: GenderMarker[] }
  | { kind: "nft"; config: NftCheckConfig }
  | { kind: "token_balance"; assetId: string; minAmount: string }
  | { kind: "passport_score"; minimumScore: number };

export type GateWizardDraft = {
  membershipMode: GateWizardMembershipMode;
  inviteRule: GateWizardInviteRule;
  checks: GateWizardCheck[];
};

// Story-owned option lists. Display names use locale copy where available and
// Intl.DisplayNames for the complete country catalog in the picker.
export const NATIONALITY_COUNTRY_OPTIONS: readonly string[] = [
  "AF", "AL", "DZ", "AS", "AD", "AO", "AI", "AQ", "AG", "AR", "AM", "AW", "AU", "AT", "AZ",
  "BS", "BH", "BD", "BB", "BY", "BE", "BZ", "BJ", "BM", "BT", "BO", "BQ", "BA", "BW", "BV", "BR", "IO", "BN", "BG", "BF", "BI",
  "CV", "KH", "CM", "CA", "KY", "CF", "TD", "CL", "CN", "CX", "CC", "CO", "KM", "CG", "CD", "CK", "CR", "CI", "HR", "CU", "CW", "CY", "CZ",
  "DK", "DJ", "DM", "DO", "EC", "EG", "SV", "GQ", "ER", "EE", "SZ", "ET", "FK", "FO", "FJ", "FI", "FR", "GF", "PF", "TF", "GA", "GM", "GE", "DE", "GH", "GI", "GR", "GL", "GD", "GP", "GU", "GT", "GG", "GN", "GW", "GY",
  "HT", "HM", "VA", "HN", "HK", "HU", "IS", "IN", "ID", "IR", "IQ", "IE", "IM", "IL", "IT", "JM", "JP", "JE", "JO", "KZ", "KE", "KI", "KP", "KR", "KW", "KG", "LA", "LV", "LB", "LS", "LR", "LY", "LI", "LT", "LU", "MO", "MG", "MW", "MY", "MV", "ML", "MT", "MH", "MQ", "MR", "MU", "YT", "MX", "FM", "MD", "MC", "MN", "ME", "MS", "MA", "MZ", "MM", "NA", "NR", "NP", "NL", "NC", "NZ", "NI", "NE", "NG", "NU", "NF", "MK", "MP", "NO", "OM", "PK", "PW", "PS", "PA", "PG", "PY", "PE", "PH", "PN", "PL", "PT", "PR", "QA", "RE", "RO", "RU", "RW", "BL", "SH", "KN", "LC", "MF", "PM", "VC", "WS", "SM", "ST", "SA", "SN", "RS", "SC", "SL", "SG", "SX", "SK", "SI", "SB", "SO", "ZA", "GS", "SS", "ES", "LK", "SD", "SR", "SJ", "SE", "CH", "SY", "TW", "TJ", "TZ", "TH", "TL", "TG", "TK", "TO", "TT", "TN", "TR", "TM", "TC", "TV", "UG", "UA", "AE", "GB", "US", "UM", "UY", "UZ", "VU", "VE", "VN", "VG", "VI", "WF", "EH", "YE", "ZM", "ZW",
] as const;
export const GENDER_MARKER_OPTIONS: readonly GenderMarker[] = ["M", "F"];
export const NFT_COLLECTIBLE_CATEGORIES: readonly string[] = ["trading-card", "watch"];

const MAINNET_CONTRACT_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const CAIP19_ASSET_PATTERN = /^eip155:1\/erc20:0x[0-9a-fA-F]{40}$/;

export function createDefaultGateWizardDraft(): GateWizardDraft {
  return { membershipMode: "humans-only", inviteRule: "open", checks: [] };
}

function sortGateWizardChecks(checks: GateWizardCheck[]): GateWizardCheck[] {
  return [...checks].sort(
    (left, right) =>
      GATE_CHECK_CATALOG.findIndex((entry) => entry.kind === left.kind) -
      GATE_CHECK_CATALOG.findIndex((entry) => entry.kind === right.kind),
  );
}

function defaultGateCheck(kind: GateCheckKind): GateWizardCheck {
  switch (kind) {
    case "age18":
      return { kind };
    case "nationality":
      return { kind, allowedCountries: [] };
    case "gender":
      return { kind, allowedMarkers: [] };
    case "nft":
      return { kind, config: { mode: "collection", contractAddress: "", minCount: 1 } };
    case "token_balance":
      return { kind, assetId: "", minAmount: "" };
    case "passport_score":
      return { kind, minimumScore: 20 };
  }
}

export function selectedGateCheck(
  draft: GateWizardDraft,
  kind: GateCheckKind,
): GateWizardCheck | null {
  return draft.checks.find((check) => check.kind === kind) ?? null;
}

export function toggleGateCheck(
  draft: GateWizardDraft,
  kind: GateCheckKind,
  mode: GateCheckCatalogMode,
): GateWizardDraft {
  const entry = gateCheckCatalogEntry(kind);
  if (!entry || !isGateCheckSelectable(entry, mode)) return draft;
  const checks = draft.checks.some((check) => check.kind === kind)
    ? draft.checks.filter((check) => check.kind !== kind)
    : [...draft.checks, defaultGateCheck(kind)];
  return { ...draft, checks: sortGateWizardChecks(checks) };
}

export function replaceGateCheck(
  draft: GateWizardDraft,
  check: GateWizardCheck,
): GateWizardDraft {
  const checks = draft.checks.some((existing) => existing.kind === check.kind)
    ? draft.checks.map((existing) => (existing.kind === check.kind ? check : existing))
    : [...draft.checks, check];
  return { ...draft, checks: sortGateWizardChecks(checks) };
}

export function parsePositiveAmount(value: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(value.trim())) return null;
  const amount = Number(value);
  return amount > 0 ? amount : null;
}

function isCountInRange(count: number): boolean {
  return Number.isInteger(count) && count >= 1 && count <= 100;
}

export function isGateCheckComplete(check: GateWizardCheck): boolean {
  switch (check.kind) {
    case "age18":
      return true;
    case "nationality":
      return check.allowedCountries.length > 0;
    case "gender":
      return check.allowedMarkers.length > 0;
    case "nft":
      return check.config.mode === "collection"
        ? MAINNET_CONTRACT_PATTERN.test(check.config.contractAddress.trim()) &&
            isCountInRange(check.config.minCount)
        : check.config.category !== "" &&
            check.config.subject.trim() !== "" &&
            isCountInRange(check.config.minQuantity);
    case "token_balance":
      return (
        CAIP19_ASSET_PATTERN.test(check.assetId.trim()) &&
        parsePositiveAmount(check.minAmount) !== null
      );
    case "passport_score":
      return (
        Number.isInteger(check.minimumScore) &&
        check.minimumScore >= 0 &&
        check.minimumScore <= 100
      );
  }
}

export function incompleteGateCheckKinds(draft: GateWizardDraft): GateCheckKind[] {
  return draft.checks.filter((check) => !isGateCheckComplete(check)).map((check) => check.kind);
}

export function isGateWizardDraftComplete(draft: GateWizardDraft): boolean {
  return incompleteGateCheckKinds(draft).length === 0;
}

export function draftIncludesExplorationChecks(draft: GateWizardDraft): boolean {
  return draft.checks.some((check) => {
    const entry = gateCheckCatalogEntry(check.kind);
    return entry?.capability === "exploration";
  });
}

export type CompiledGateRequirement =
  | { requirement: "human-verification" }
  | { requirement: "invite" }
  | { requirement: "age-minimum"; minimumAge: 18 }
  | { requirement: "nationality-allowed"; allowedCountries: string[] }
  | { requirement: "gender-marker"; allowedMarkers: GenderMarker[] }
  | { requirement: "erc721-collection"; contractAddress: string; minCount: number }
  | { requirement: "inventory-match"; category: string; subject: string; minQuantity: number }
  | { requirement: "asset-ownership"; assetId: string; minAmount: string }
  | { requirement: "reputation-score"; provider: "passport"; minimumScore: number };

export type CompiledGatePolicy = {
  version: 1;
  accessPaths: ReadonlyArray<{
    id: string;
    operator: "and";
    requirements: CompiledGateRequirement[];
  }>;
};

export function compileGateWizardDraft(draft: GateWizardDraft): CompiledGatePolicy {
  const requirements: CompiledGateRequirement[] = [];
  if (draft.membershipMode === "humans-only") {
    requirements.push({ requirement: "human-verification" });
  }
  if (draft.inviteRule === "invite-required") {
    requirements.push({ requirement: "invite" });
  }
  for (const check of sortGateWizardChecks(draft.checks)) {
    switch (check.kind) {
      case "age18":
        requirements.push({ requirement: "age-minimum", minimumAge: 18 });
        break;
      case "nationality":
        requirements.push({
          requirement: "nationality-allowed",
          allowedCountries: [...check.allowedCountries].sort(),
        });
        break;
      case "gender":
        requirements.push({
          requirement: "gender-marker",
          allowedMarkers: [...check.allowedMarkers],
        });
        break;
      case "nft":
        if (check.config.mode === "collection") {
          requirements.push({
            requirement: "erc721-collection",
            contractAddress: check.config.contractAddress.trim(),
            minCount: check.config.minCount,
          });
        } else {
          requirements.push({
            requirement: "inventory-match",
            category: check.config.category,
            subject: check.config.subject.trim(),
            minQuantity: check.config.minQuantity,
          });
        }
        break;
      case "token_balance":
        requirements.push({
          requirement: "asset-ownership",
          assetId: check.assetId.trim(),
          minAmount: check.minAmount.trim(),
        });
        break;
      case "passport_score":
        requirements.push({
          requirement: "reputation-score",
          provider: "passport",
          minimumScore: check.minimumScore,
        });
        break;
    }
  }
  return {
    version: 1,
    accessPaths: [{ id: "path-1", operator: "and", requirements }],
  };
}
