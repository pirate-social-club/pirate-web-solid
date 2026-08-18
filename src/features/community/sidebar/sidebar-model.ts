export type GateStatus = "met" | "unmet" | "unknown";
export type GateMode = "all" | "any" | "unknown";

export interface SidebarGate {
  type: string;
  label: string;
  status: GateStatus;
  provider?: string;
}

export interface SidebarRule {
  title: string;
  body: string;
  position: number;
}

export interface SidebarReferenceLink {
  label: string;
  href: string;
  position: number;
}

export function orderedGates(gates: readonly SidebarGate[]): SidebarGate[] {
  const rank: Record<GateStatus, number> = { unmet: 0, unknown: 1, met: 2 };
  return [...gates].sort((left, right) => rank[left.status] - rank[right.status]);
}

export function gateModeLabel(mode: GateMode, count: number, hasActionTimeCheck = false): string {
  if (hasActionTimeCheck && count === 0) return "Browser check at join time";
  const durableLabel = count === 0
    ? "No durable requirements"
    : mode === "all"
      ? `All ${count} requirements`
      : mode === "any"
        ? `Any ${count} requirements`
        : "Requirements pending match mode";
  return hasActionTimeCheck ? `${durableLabel} or browser check at join time` : durableLabel;
}

export function emptyGateCopy(hasActionTimeCheck: boolean): string {
  return hasActionTimeCheck
    ? "A browser check runs when you join."
    : "No durable requirements are configured.";
}

export function formatCommunityCount(value: number, locale = "en-US"): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function orderedSidebarRules(rules: readonly SidebarRule[]): SidebarRule[] {
  return [...rules].sort((left, right) => left.position - right.position);
}

export function orderedSidebarReferenceLinks(links: readonly SidebarReferenceLink[]): SidebarReferenceLink[] {
  return [...links].sort((left, right) => left.position - right.position);
}

export function safeSidebarHref(href: string): string | null {
  const trimmed = href.trim();
  if ((trimmed.startsWith("/") && !trimmed.startsWith("//")) || trimmed.startsWith("https://")) return trimmed;
  return null;
}
