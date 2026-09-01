import type {
  CommunityModerationCapabilities,
  CommunityModerationCase,
  CommunityModerationCaseDetail,
  CommunityModerationCaseList,
  CommunityModerationPolicy,
} from "./community-moderation-settings-model";

export const MODERATION_VIEW_AND_ACT: CommunityModerationCapabilities = ["moderation.view", "moderation.act"];
export const MODERATION_VIEW_ONLY: CommunityModerationCapabilities = ["moderation.view"];

const CASES: ReadonlyArray<CommunityModerationCase> = [
  {
    case_ref: "case_report_1042",
    community_id: "community_midnight",
    target_type: "text_post",
    target_id: "post_1042",
    author_persona_id: "persona_signal",
    source: "mixed",
    target_status: "held",
    resulting_content_rating: "general",
    case_revision: 4,
    permitted_actions: ["approve_as_general", "approve_as_adult_18", "reject"],
    created_at: "2026-08-31T14:20:00Z",
    updated_at: "2026-09-01T08:42:00Z",
  },
  {
    case_ref: "case_report_1038",
    community_id: "community_midnight",
    target_type: "comment",
    target_id: "comment_1038",
    author_persona_id: "persona_tidepool",
    source: "member_report",
    target_status: "published",
    resulting_content_rating: "general",
    case_revision: 2,
    permitted_actions: ["dismiss_report", "hide", "raise_rating_to_adult_18"],
    created_at: "2026-08-30T09:12:00Z",
    updated_at: "2026-08-30T09:12:00Z",
  },
];

export const OPEN_MODERATION_CASES: CommunityModerationCaseList = {
  object: "community_moderation_case_list",
  community_id: "community_midnight",
  view: "open",
  items: CASES,
};

export const EMPTY_MODERATION_CASES: CommunityModerationCaseList = {
  object: "community_moderation_case_list",
  community_id: "community_midnight",
  view: "open",
  items: [],
};

export const HIDDEN_MODERATION_CASES: CommunityModerationCaseList = {
  object: "community_moderation_case_list",
  community_id: "community_midnight",
  view: "hidden",
  items: [{
    ...CASES[1]!,
    case_ref: "case_hidden_982",
    target_status: "hidden",
    permitted_actions: ["restore"],
  }],
};

export const MODERATION_CASE_DETAIL: CommunityModerationCaseDetail = {
  object: "community_moderation_case",
  case: CASES[0]!,
  preview: {
    kind: "text",
    title: "Field recordings from the eastern breakwater",
    body: "A member reported the closing paragraph. Review the post in context before choosing an action.",
  },
  evidence: {
    matched_categories: ["harassment"],
    category_decisions: { harassment: "review" },
    effective_decision: "review",
    resulting_content_rating: "general",
    author_declared_rating: "general",
    provider_scores: { harassment: 0.78 },
    applied_input_types: { harassment: ["text"] },
    policy_revision: "policy-revision-12",
    policy_hash: "policy-hash-12",
    platform_policy_revision: "platform-policy-7",
    platform_policy_hash: "platform-hash-7",
    community_policy_revision: "community-policy-12",
    community_policy_hash: "community-hash-12",
  },
};

export const SECOND_MODERATION_CASE_DETAIL: CommunityModerationCaseDetail = {
  object: "community_moderation_case",
  case: CASES[1]!,
  preview: {
    kind: "text",
    title: null,
    body: "This comment was reported by a member for a personal attack in an otherwise constructive discussion.",
  },
  evidence: {
    ...MODERATION_CASE_DETAIL.evidence,
    matched_categories: ["harassment"],
    provider_scores: { harassment: 0.63 },
  },
};

export const OPEN_MODERATION_CASE_DETAILS: ReadonlyArray<CommunityModerationCaseDetail> = [
  MODERATION_CASE_DETAIL,
  SECOND_MODERATION_CASE_DETAIL,
];

export const HIDDEN_MODERATION_CASE_DETAILS: ReadonlyArray<CommunityModerationCaseDetail> = [{
  ...SECOND_MODERATION_CASE_DETAIL,
  case: HIDDEN_MODERATION_CASES.items[0]!,
  preview: { kind: "text", title: null, body: "This comment is hidden. Restore it if it no longer violates community policy." },
}];

export const LOCKED_MODERATION_CASE_DETAIL: CommunityModerationCaseDetail = {
  ...MODERATION_CASE_DETAIL,
  case: { ...CASES[0]!, resulting_content_rating: "adult_18" },
  preview: { kind: "locked", reason: "adult_rating" },
  evidence: {
    ...MODERATION_CASE_DETAIL.evidence,
    matched_categories: ["sexual"],
    category_decisions: { sexual: "review" },
    resulting_content_rating: "adult_18",
    author_declared_rating: "adult_18",
    provider_scores: { sexual: 0.91 },
    applied_input_types: { sexual: ["text", "image"] },
  },
};

const category = (
  name: CommunityModerationPolicy["categories"][number]["category"],
  communityDecision: CommunityModerationPolicy["categories"][number]["community_decision"],
  locked = false,
): CommunityModerationPolicy["categories"][number] => ({
  category: name,
  input_types: ["text", "image"],
  platform_floor_decision: locked ? "block" : "permit",
  community_decision: communityDecision,
  effective_decision: locked ? "block" : communityDecision,
  locked,
  permit_rating: name.startsWith("sexual") || name.startsWith("violence") ? "adult_18" : "general",
});

export const MODERATION_POLICY: CommunityModerationPolicy = {
  version: "community-moderation-policy-v1",
  community_id: "community_midnight",
  policy_revision_id: "policy-revision-12",
  policy_hash: "policy-hash-12",
  revision: 12,
  platform_floor_revision_id: "platform-policy-7",
  platform_floor_hash: "platform-hash-7",
  categories: [
    category("harassment", "review"),
    category("harassment/threatening", "block"),
    category("hate", "review"),
    category("hate/threatening", "block"),
    category("illicit", "review"),
    category("illicit/violent", "block"),
    category("self-harm", "review"),
    category("self-harm/intent", "review"),
    category("self-harm/instructions", "block"),
    category("sexual", "review"),
    category("sexual/minors", "block", true),
    category("violence", "review"),
    category("violence/graphic", "block"),
  ],
  updated_at: "2026-08-31T18:15:00Z",
};
