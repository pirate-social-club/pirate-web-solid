import type {
  GetCommunitiesCommunityIdMeCapabilitiesResponse,
  GetCommunitiesCommunityIdModerationCasesCaseRefResponse,
  GetCommunitiesCommunityIdModerationCasesResponse,
  GetCommunitiesCommunityIdModerationPolicyResponse,
  PirateApiClient,
  PostModerationCasesCaseRefActionsInput,
  PutCommunitiesCommunityIdModerationPolicyInput,
} from "@pirate/api-client-happy-path";

export type CommunityModerationPort = Pick<
  PirateApiClient,
  | "get_communitiesCommunityIdMeCapabilities"
  | "get_communitiesCommunityIdModerationCases"
  | "get_communitiesCommunityIdModerationCasesCaseRef"
  | "get_communitiesCommunityIdModerationPolicy"
  | "post_moderationCasesCaseRefActions"
  | "put_communitiesCommunityIdModerationPolicy"
>;

export type CommunityModerationCapabilities = GetCommunitiesCommunityIdMeCapabilitiesResponse["capabilities"];
export type CommunityModerationCaseList = GetCommunitiesCommunityIdModerationCasesResponse;
export type CommunityModerationCaseView = CommunityModerationCaseList["view"];
export type CommunityModerationCase = CommunityModerationCaseList["items"][number];
export type CommunityModerationCaseDetail = GetCommunitiesCommunityIdModerationCasesCaseRefResponse;
export type CommunityModerationCaseAction = PostModerationCasesCaseRefActionsInput["body"]["action"];
export type CommunityModerationCaseActionInput = PostModerationCasesCaseRefActionsInput;
export type CommunityModerationPolicy = GetCommunitiesCommunityIdModerationPolicyResponse;
export type CommunityModerationPolicyCategory = CommunityModerationPolicy["categories"][number]["category"];
export type CommunityModerationPolicyDecision = CommunityModerationPolicy["categories"][number]["community_decision"];
export type CommunityModerationPolicyDecisions = PutCommunitiesCommunityIdModerationPolicyInput["body"]["decisions"];
export type CommunityModerationPolicyUpdateInput = PutCommunitiesCommunityIdModerationPolicyInput;
export type CommunityModerationPane = "cases" | "policy";

export const COMMUNITY_MODERATION_CATEGORIES: ReadonlyArray<CommunityModerationPolicyCategory> = [
  "harassment",
  "harassment/threatening",
  "hate",
  "hate/threatening",
  "illicit",
  "illicit/violent",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "sexual",
  "sexual/minors",
  "violence",
  "violence/graphic",
];

export function canViewCommunityModeration(capabilities: CommunityModerationCapabilities): boolean {
  return capabilities.includes("moderation.view");
}

export function canActOnCommunityModeration(capabilities: CommunityModerationCapabilities): boolean {
  return capabilities.includes("moderation.act");
}

export function moderationPolicyDecisions(policy: CommunityModerationPolicy): CommunityModerationPolicyDecisions {
  const decisions = new Map(policy.categories.map((category) => [category.category, category.community_decision]));
  const decision = (category: CommunityModerationPolicyCategory): CommunityModerationPolicyDecision => {
    const value = decisions.get(category);
    if (!value) throw new Error(`missing_moderation_policy_category:${category}`);
    return value;
  };
  return {
    harassment: decision("harassment"),
    "harassment/threatening": decision("harassment/threatening"),
    hate: decision("hate"),
    "hate/threatening": decision("hate/threatening"),
    illicit: decision("illicit"),
    "illicit/violent": decision("illicit/violent"),
    "self-harm": decision("self-harm"),
    "self-harm/intent": decision("self-harm/intent"),
    "self-harm/instructions": decision("self-harm/instructions"),
    sexual: decision("sexual"),
    "sexual/minors": decision("sexual/minors"),
    violence: decision("violence"),
    "violence/graphic": decision("violence/graphic"),
  };
}

export function moderationCaseActionInput(input: {
  action: CommunityModerationCaseAction;
  case: CommunityModerationCase;
  idempotencyKey: string;
}): CommunityModerationCaseActionInput {
  return {
    path: { caseRef: input.case.case_ref },
    body: {
      version: "moderation-case-action-v2",
      action: input.action,
      expected_case_revision: input.case.case_revision,
      idempotency_key: input.idempotencyKey,
    },
  };
}

export function moderationPolicyUpdateInput(input: {
  decisions: CommunityModerationPolicyDecisions;
  policy: CommunityModerationPolicy;
}): CommunityModerationPolicyUpdateInput {
  return {
    path: { communityId: input.policy.community_id },
    body: {
      expected_policy_revision: input.policy.policy_revision_id,
      decisions: input.decisions,
    },
  };
}
