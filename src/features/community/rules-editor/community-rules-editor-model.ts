export interface RuleDraft {
  id: string;
  existingRuleId: string | null;
  title: string;
  body: string;
  reportReason: string;
}

export function nextRuleDraftId(existingIds: readonly string[]): string {
  const owned = new Set(existingIds);
  let index = 1;
  while (owned.has(`draft-${index}`)) index += 1;
  return `draft-${index}`;
}

export function createEmptyRuleDraft(existingIds: readonly string[] = []): RuleDraft {
  return {
    id: nextRuleDraftId(existingIds),
    existingRuleId: null,
    title: "",
    body: "",
    reportReason: "",
  };
}

export function hasRuleTitle(rule: Pick<RuleDraft, "title">): boolean {
  return rule.title.trim().length > 0;
}

export function isBlankNewRule(rule: RuleDraft): boolean {
  return !rule.existingRuleId && !rule.title.trim() && !rule.body.trim();
}
