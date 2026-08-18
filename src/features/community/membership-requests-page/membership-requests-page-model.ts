export type MembershipRequestStatus = "pending" | "approved" | "rejected" | "expired";

/** The API summary shape is kept local because the Solid package does not depend on API contracts. */
export interface MembershipRequestSummary {
  id: string;
  object: "membership_request_summary";
  community: string;
  applicant_user: string;
  applicant_handle?: string | null;
  applicant_avatar_ref?: string | null;
  status: MembershipRequestStatus;
  note?: string | null;
  created: number;
}

export function buildPublicProfilePath(handleLabel: string): string {
  return `/u/${encodeURIComponent(handleLabel)}`;
}

export function getApplicantLabel(request: MembershipRequestSummary): string {
  return request.applicant_handle?.trim() || "Member";
}

export function formatMembershipRequestDate(value: number, locale = "en"): string {
  const date = new Date(value * 1000);
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function isMembershipRequestProcessing(
  requestId: string,
  processingRequestId?: string | null,
): boolean {
  return requestId === (processingRequestId ?? null);
}
