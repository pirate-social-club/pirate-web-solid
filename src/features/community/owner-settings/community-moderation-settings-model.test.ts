import { describe, expect, it } from "vitest";
import { MODERATION_CASE_DETAIL, MODERATION_POLICY, MODERATION_VIEW_AND_ACT, MODERATION_VIEW_ONLY } from "./community-moderation-settings-fixtures";
import {
  COMMUNITY_MODERATION_CATEGORIES,
  canActOnCommunityModeration,
  canViewCommunityModeration,
  moderationCaseActionInput,
  moderationPolicyDecisions,
  moderationPolicyUpdateInput,
} from "./community-moderation-settings-model";

describe("community moderation settings model", () => {
  it("uses the server capability set for view and action gates", () => {
    expect(canViewCommunityModeration(MODERATION_VIEW_ONLY)).toBe(true);
    expect(canActOnCommunityModeration(MODERATION_VIEW_ONLY)).toBe(false);
    expect(canActOnCommunityModeration(MODERATION_VIEW_AND_ACT)).toBe(true);
  });

  it("builds the generated v2 action command with a stable fence", () => {
    expect(moderationCaseActionInput({ action: "reject", case: MODERATION_CASE_DETAIL.case, idempotencyKey: "case-operation-1" })).toEqual({
      path: { caseRef: "case_report_1042" },
      body: { version: "moderation-case-action-v2", action: "reject", expected_case_revision: 4, idempotency_key: "case-operation-1" },
    });
  });

  it("sends every policy category with the server revision fence", () => {
    const decisions = moderationPolicyDecisions(MODERATION_POLICY);
    expect(Object.keys(decisions)).toEqual(COMMUNITY_MODERATION_CATEGORIES);
    expect(moderationPolicyUpdateInput({ decisions, policy: MODERATION_POLICY })).toEqual({
      path: { communityId: "community_midnight" },
      body: { expected_policy_revision: "policy-revision-12", decisions },
    });
  });
});
