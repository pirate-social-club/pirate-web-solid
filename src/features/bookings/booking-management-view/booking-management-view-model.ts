type BookingManagementSection = "upcoming" | "review" | "past" | "cancelled";
export type BookingManagementTone = "default" | "success" | "warning" | "muted";

export interface BookingManagementItem {
  id: string;
  counterpartyName: string;
  counterpartyHandle: string;
  counterpartyAvatarUrl?: string | null;
  sessionTimeLabel: string;
  amountLabel: string;
  statusLabel: string;
  statusDetail: string;
  statusTone: BookingManagementTone;
  section: BookingManagementSection;
  joinState?: "unavailable" | "available" | "live";
  joinAvailabilityLabel?: string;
  canCancel?: boolean;
  canAddToCalendar?: boolean;
}

export interface BookingManagementSectionGroup {
  section: BookingManagementSection;
  items: BookingManagementItem[];
}

export function groupBookingManagementItems(items: readonly BookingManagementItem[]): BookingManagementSectionGroup[] {
  return (["upcoming", "review", "past", "cancelled"] as const)
    .map((section) => ({ section, items: items.filter((item) => item.section === section) }))
    .filter((entry) => entry.items.length > 0);
}

export function managementToneClass(tone: BookingManagementTone): string {
  switch (tone) {
    case "success": return "text-success";
    case "warning": return "text-warning";
    case "muted": return "text-muted-foreground";
    case "default": return "text-foreground";
  }
}
