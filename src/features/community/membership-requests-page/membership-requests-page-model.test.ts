import { describe, expect, test } from "bun:test";

import {
  buildPublicProfilePath,
  formatMembershipRequestDate,
  getApplicantLabel,
  isMembershipRequestProcessing,
  type MembershipRequestSummary,
} from "./membership-requests-page-model";

const MAYA: MembershipRequestSummary = {
  id: "mreq_1",
  object: "membership_request_summary",
  community: "cmt_signal",
  applicant_user: "usr_1",
  applicant_handle: "maya.pirate",
  applicant_avatar_ref: null,
  status: "pending",
  note: "I have been following the community and would like to participate.",
  created: 1777024800,
};

describe("membership requests model", () => {
  test("keeps the exact local API summary contract and stable profile path", () => {
    expect(MAYA.object).toBe("membership_request_summary");
    expect(buildPublicProfilePath(MAYA.applicant_handle!)).toBe("/u/maya.pirate");
    expect(buildPublicProfilePath("maya pirate")).toBe("/u/maya%20pirate");
  });

  test("trims handles and falls back to Member", () => {
    expect(getApplicantLabel(MAYA)).toBe("maya.pirate");
    expect(getApplicantLabel({ ...MAYA, applicant_handle: "  " })).toBe("Member");
    expect(getApplicantLabel({ ...MAYA, applicant_handle: null })).toBe("Member");
  });

  test("formats epoch seconds in 2026 rather than the millisecond year-58000 bug", () => {
    const formatted = formatMembershipRequestDate(1777024800, "en-US");

    expect(formatted).toContain("2026");
    expect(formatted).not.toContain("58000");
  });

  test("isolates processing to the matching request id", () => {
    expect(isMembershipRequestProcessing("mreq_1", "mreq_1")).toBe(true);
    expect(isMembershipRequestProcessing("mreq_2", "mreq_1")).toBe(false);
    expect(isMembershipRequestProcessing("mreq_1", null)).toBe(false);
  });
});
