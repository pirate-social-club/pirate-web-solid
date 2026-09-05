import { describe, expect, test } from "vitest";
import {
  communityOperationPersonas,
  communityJoinCandidates,
  communityCreationCandidates,
  defaultCommunityPersonaChoice,
  defaultOperationPersonaId,
} from "./community-persona-choice";

const persona = (personaId: string, communityId: string | null) => ({
  personaId,
  displayName: personaId,
  avatarRef: null,
  primaryPublicHandle: null,
  communityBinding: communityId === null ? null : {
    communityId,
    bindingSource: "first_membership" as const,
  },
});
const here = persona("here", "community-a");
const sibling = persona("sibling", "community-a");
const elsewhere = persona("elsewhere", "community-b");
const unbound = persona("unbound", null);
const all = [elsewhere, unbound, here, sibling];

describe("community-scoped persona choices", () => {
  test("operations offer only personas bound here, regardless of global order", () => {
    expect(communityOperationPersonas(all, "community-a")).toEqual([here, sibling]);
    expect(communityOperationPersonas(all, "community-c")).toEqual([]);
    expect(defaultOperationPersonaId([here])).toBe("here");
    expect(defaultOperationPersonaId([here, sibling])).toBeUndefined();
    expect(defaultOperationPersonaId([])).toBeUndefined();
  });
  test("join offers bound-here plus unbound, never bound-elsewhere", () => {
    expect(communityJoinCandidates(all, "community-a")).toEqual([unbound, here, sibling]);
    expect(communityJoinCandidates([elsewhere], "community-a")).toEqual([]);
    expect(defaultCommunityPersonaChoice([])).toEqual({ kind: "create_new" });
    expect(defaultCommunityPersonaChoice([unbound])).toEqual({
      kind: "existing", personaId: "unbound",
    });
    expect(defaultCommunityPersonaChoice([unbound, here])).toBeUndefined();
  });
  test("creation offers only unbound candidates, with the create-new branch available", () => {
    expect(communityCreationCandidates(all)).toEqual([unbound]);
    expect(communityCreationCandidates([here, elsewhere])).toEqual([]);
    expect(defaultCommunityPersonaChoice(communityCreationCandidates([here]))).toEqual({
      kind: "create_new",
    });
  });
});
