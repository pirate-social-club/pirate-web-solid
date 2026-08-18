import { describe, expect, test } from "bun:test";

import {
  createEmptyRuleDraft,
  hasRuleTitle,
  isBlankNewRule,
  nextRuleDraftId,
} from "./community-rules-editor-model";

describe("community rules editor model", () => {
  test("allocates stable draft ids and keeps the exact fixture shape", () => {
    expect(nextRuleDraftId([])).toBe("draft-1");
    expect(nextRuleDraftId(["draft-1", "draft-3"])).toBe("draft-2");
    expect(createEmptyRuleDraft(["draft-1"])).toEqual({
      id: "draft-2",
      existingRuleId: null,
      title: "",
      body: "",
      reportReason: "",
    });
  });

  test("requires a trimmed title and cancels only a blank new draft", () => {
    const blank = createEmptyRuleDraft();
    expect(hasRuleTitle(blank)).toBe(false);
    expect(isBlankNewRule(blank)).toBe(true);
    expect(hasRuleTitle({ title: "  title  " })).toBe(true);
    expect(isBlankNewRule({ ...blank, reportReason: "custom report reason" })).toBe(true);
    expect(isBlankNewRule({ ...blank, body: "Body" })).toBe(false);
    expect(isBlankNewRule({ ...blank, existingRuleId: "rule-1" })).toBe(false);
  });
});
