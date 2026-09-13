import type { CommunityCreationIntentView } from "./community-creation-intent-model";

/**
 * A complete intent view for Storybook and test fixtures. It is not
 * production data and carries no server authority.
 */
export function createIntentView(
  overrides: Partial<CommunityCreationIntentView> = {},
): CommunityCreationIntentView {
  return {
    intentId: "creation_1",
    revision: 1,
    status: "draft",
    nextAction: { kind: "wait", requirement: null, reasonCode: "operation_pending" },
    expiresAt: "2026-08-26T00:00:00.000Z",
    committedHref: null,
    ...overrides,
  };
}
