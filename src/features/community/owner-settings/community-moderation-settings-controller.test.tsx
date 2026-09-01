import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { CommunityModerationSettingsApi } from "./community-moderation-settings-api";
import { CommunityModerationSettingsController } from "./community-moderation-settings-controller";
import {
  HIDDEN_MODERATION_CASE_DETAILS,
  HIDDEN_MODERATION_CASES,
  MODERATION_POLICY,
  MODERATION_VIEW_AND_ACT,
  OPEN_MODERATION_CASE_DETAILS,
  OPEN_MODERATION_CASES,
} from "./community-moderation-settings-fixtures";

const disposers: Array<() => void> = [];

function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot((rootDispose) => {
    dispose = rootDispose;
    solidRender(ui, container);
  });
  disposers.push(() => { dispose(); container.remove(); });
  return container;
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

function moderationApi(overrides: Partial<CommunityModerationSettingsApi> = {}): CommunityModerationSettingsApi {
  return {
    actOnCase: async () => undefined,
    getCapabilities: async () => MODERATION_VIEW_AND_ACT,
    getCases: async () => ({ cases: OPEN_MODERATION_CASES, details: OPEN_MODERATION_CASE_DETAILS }),
    getPolicy: async () => MODERATION_POLICY,
    updatePolicy: async () => MODERATION_POLICY,
    ...overrides,
  };
}

describe("CommunityModerationSettingsController", () => {
  test("loads the owner queue and refreshes it after a fenced action", async () => {
    const actionInputs: Parameters<CommunityModerationSettingsApi["actOnCase"]>[0][] = [];
    const actOnCase: CommunityModerationSettingsApi["actOnCase"] = async (input) => {
      actionInputs.push(input);
    };
    const getCases = vi.fn(async () => ({ cases: OPEN_MODERATION_CASES, details: OPEN_MODERATION_CASE_DETAILS }));
    const container = render(() => (
      <CommunityModerationSettingsController
        api={moderationApi({ actOnCase, getCases })}
        communityId="community_midnight"
        section="moderation_queue"
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Field recordings from the eastern breakwater"));
    const reject = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Don't publish");
    expect(reject).toBeDefined();
    reject!.click();

    await vi.waitFor(() => expect(actionInputs).toHaveLength(1));
    await vi.waitFor(() => expect(getCases).toHaveBeenCalledTimes(2));
    expect(actionInputs[0]).toMatchObject({
      path: { caseRef: "case_report_1042" },
      body: {
        action: "reject",
        expected_case_revision: 4,
        version: "moderation-case-action-v2",
      },
    });
    expect(actionInputs[0]!.body.idempotency_key).toMatch(/^community-moderation:case:case_report_1042:4:reject:/);
  });

  test("switches from open cases to the taken-down queue", async () => {
    const getCases = vi.fn(async ({ view }: Parameters<CommunityModerationSettingsApi["getCases"]>[0]) => (
      view === "hidden"
        ? { cases: HIDDEN_MODERATION_CASES, details: HIDDEN_MODERATION_CASE_DETAILS }
        : { cases: OPEN_MODERATION_CASES, details: OPEN_MODERATION_CASE_DETAILS }
    ));
    const container = render(() => (
      <CommunityModerationSettingsController
        api={moderationApi({ getCases })}
        communityId="community_midnight"
        section="moderation_queue"
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Field recordings from the eastern breakwater"));
    const takenDown = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Taken down");
    expect(takenDown).toBeDefined();
    takenDown!.click();

    await vi.waitFor(() => expect(getCases).toHaveBeenLastCalledWith({
      communityId: "community_midnight",
      view: "hidden",
    }));
    await vi.waitFor(() => expect(container.textContent).toContain("Restore"));
  });

  test("fails closed without the server moderation.view capability", async () => {
    const getCases = vi.fn(async () => ({ cases: OPEN_MODERATION_CASES, details: OPEN_MODERATION_CASE_DETAILS }));
    const container = render(() => (
      <CommunityModerationSettingsController
        api={moderationApi({ getCapabilities: async () => [], getCases })}
        communityId="community_midnight"
        section="moderation_queue"
      />
    ));

    await vi.waitFor(() => expect(container.querySelector("[data-owner-settings-denied]")).not.toBeNull());
    expect(getCases).not.toHaveBeenCalled();
  });
});
