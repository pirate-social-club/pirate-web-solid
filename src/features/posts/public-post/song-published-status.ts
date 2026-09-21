export type SongAlignmentStatus = "not_applicable" | "pending" | "ready" | "unavailable";
export type SongDataRegistrationStatus = "pending" | "registered" | "failed";

export interface SongPublishedStatus {
  readonly alignment: SongAlignmentStatus;
  readonly dataRegistration: SongDataRegistrationStatus;
}

function isAlignmentStatus(value: unknown): value is SongAlignmentStatus {
  return value === "not_applicable" || value === "pending"
    || value === "ready" || value === "unavailable";
}

function isDataRegistrationStatus(value: unknown): value is SongDataRegistrationStatus {
  return value === "pending" || value === "registered" || value === "failed";
}

export function readSongPublishedStatus(value: unknown): SongPublishedStatus | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)
    || !("alignment" in value) || !("data_registration" in value)
    || !isAlignmentStatus(value.alignment)
    || !isDataRegistrationStatus(value.data_registration)) return null;
  return { alignment: value.alignment, dataRegistration: value.data_registration };
}

export function songAlignmentStatusLabel(status: SongAlignmentStatus): string {
  switch (status) {
    case "ready": return "Ready";
    case "pending": return "Being prepared";
    case "unavailable": return "Unavailable";
    case "not_applicable": return "Not applicable";
  }
}

export function songDataRegistrationStatusLabel(status: SongDataRegistrationStatus): string {
  switch (status) {
    case "registered": return "Complete";
    case "pending": return "Pending";
    case "failed": return "Failed";
  }
}
