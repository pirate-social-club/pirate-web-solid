import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ApiClientError } from "@pirate/api-client";

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

  test("selects the requested view immediately and keeps the list until the new one lands", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const container = render(() => (
      <CommunityModerationSettingsController
        api={moderationApi({
          getCases: async ({ view }) => {
            if (view === "hidden") await gate;
            return view === "hidden"
              ? { cases: HIDDEN_MODERATION_CASES, details: HIDDEN_MODERATION_CASE_DETAILS }
              : { cases: OPEN_MODERATION_CASES, details: OPEN_MODERATION_CASE_DETAILS };
          },
        })}
        capabilities={MODERATION_VIEW_AND_ACT}
        communityId="community_midnight"
        section="moderation_queue"
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Needs review"));
    const openCases = container.textContent;
    const takenDown = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Taken down");
    takenDown!.click();

    // Mid-flight: the control shows the requested view and the previous list is
    // still on screen rather than replaced by a spinner.
    await vi.waitFor(() => expect(container.querySelector('[aria-busy="true"]')).not.toBeNull());
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Taken down")).toBe(true);
    expect(container.textContent).toContain("Needs review");
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent?.length).toBeGreaterThanOrEqual((openCases ?? "").length - 40);

    release();
    await vi.waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull());
  });

  test("ignores a slow response for a view the owner already left", async () => {
    let releaseHidden = () => {};
    const hiddenGate = new Promise<void>((resolve) => { releaseHidden = resolve; });
    const container = render(() => (
      <CommunityModerationSettingsController
        api={moderationApi({
          getCases: async ({ view }) => {
            if (view === "hidden") await hiddenGate;
            return view === "hidden"
              ? { cases: HIDDEN_MODERATION_CASES, details: HIDDEN_MODERATION_CASE_DETAILS }
              : { cases: OPEN_MODERATION_CASES, details: OPEN_MODERATION_CASE_DETAILS };
          },
        })}
        capabilities={MODERATION_VIEW_AND_ACT}
        communityId="community_midnight"
        section="moderation_queue"
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Needs review"));
    const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((candidate) => candidate.textContent?.trim() === label);
    button("Taken down")!.click();
    await vi.waitFor(() => expect(container.querySelector('[aria-busy="true"]')).not.toBeNull());
    button("Needs review")!.click();
    await vi.waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull());

    // The stale hidden read lands last and must not overwrite the open queue.
    releaseHidden();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.querySelector('[aria-label="Case status"] [aria-current]')).toBeNull();
    expect(container.textContent).toContain("Publish");
    expect(container.textContent).not.toContain("Restore");
  });

  test("reuses route capabilities instead of reading them again", async () => {
    const getCapabilities = vi.fn(async () => MODERATION_VIEW_AND_ACT);
    const container = render(() => (
      <CommunityModerationSettingsController
        api={moderationApi({ getCapabilities })}
        capabilities={MODERATION_VIEW_AND_ACT}
        communityId="community_midnight"
        section="moderation_queue"
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Needs review"));
    expect(getCapabilities).not.toHaveBeenCalled();
  });

  test("still fails closed when supplied capabilities omit moderation.view", async () => {
    const container = render(() => (
      <CommunityModerationSettingsController
        api={moderationApi()}
        capabilities={[]}
        communityId="community_midnight"
        section="moderation_queue"
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Owner access required"));
  });

  test("fails closed when the queue read is redacted after entry", async () => {
    const redacted = new ApiClientError(
      { code: "not_found", name: "NotFound", retryable: false, status: 404 },
      { error: { code: "not_found", message: "Redacted", retryable: false } },
    );
    const container = render(() => (
      <CommunityModerationSettingsController
        api={moderationApi({ getCases: async () => { throw redacted; } })}
        capabilities={MODERATION_VIEW_AND_ACT}
        communityId="community_midnight"
        section="moderation_queue"
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Owner access required"));
  });
});
