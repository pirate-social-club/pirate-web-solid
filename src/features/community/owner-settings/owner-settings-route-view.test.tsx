import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { CommunityModerationSettingsApi } from "./community-moderation-settings-api";
import {
  MODERATION_POLICY,
  MODERATION_VIEW_AND_ACT,
  OPEN_MODERATION_CASE_DETAILS,
  OPEN_MODERATION_CASES,
} from "./community-moderation-settings-fixtures";
import type { CommunityNamesSettingsApi } from "./community-names-settings-api";
import { NAMES_READY } from "./community-names-settings-fixtures";
import type { OwnerSettingsRouteState } from "./owner-settings-route-model";
import type { CommunityNamespaceSettingsPort } from "./owner-settings-model";
import { OwnerSettingsRouteView } from "./owner-settings-route-view";
import { createCommunityNamespaceSettingsApi } from "./community-namespace-settings-api";

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
  document.head.replaceChildren();
});

const success: OwnerSettingsRouteState = {
  access: {
    "community.moderation.manage": true,
    "community.names.manage": true,
    "community.namespace.write": true,
  },
  avatarUrl: null,
  communityId: "community_midnight",
  communityName: "Midnight Waves",
  communityPath: "/c/midnight",
  kind: "success",
};

function namesApi(): CommunityNamesSettingsApi {
  return {
    activateSaleNamespace: async () => { throw new Error("not called"); },
    createOffering: async () => undefined,
    getSnapshot: async () => NAMES_READY,
    reviseOffering: async () => undefined,
    reviseSaleNamespace: async () => undefined,
  };
}

function moderationApi(): CommunityModerationSettingsApi {
  return {
    actOnCase: async () => undefined,
    getCapabilities: async () => MODERATION_VIEW_AND_ACT,
    getCases: async () => ({ cases: OPEN_MODERATION_CASES, details: OPEN_MODERATION_CASE_DETAILS }),
    getPolicy: async () => MODERATION_POLICY,
    updatePolicy: async () => MODERATION_POLICY,
  };
}

function namespaceApi(): CommunityNamespaceSettingsPort {
  return {
    execute: async () => { throw new Error("not called"); },
    read: async () => ({
      community_id: "community_midnight",
      family: null,
      generation: 1,
      next_action: { kind: "choose_namespace" },
      root_label: "",
    }),
  };
}

describe("OwnerSettingsRouteView", () => {
  test("mounts only real authorized sections and pushes section navigation", async () => {
    const navigate = vi.fn();
    const container = render(() => (
      <OwnerSettingsRouteView
        moderationApi={moderationApi()}
        namesApi={namesApi()}
        namespaceApi={namespaceApi()}
        navigate={navigate}
        requestedSection="names"
        state={success}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("yourname.midnight"));
    expect(container.textContent).toContain("Names");
    expect(container.textContent).toContain("Queue");
    expect(container.textContent).toContain("Content policy");
    expect(container.textContent).toContain("Address");
    expect(container.textContent).not.toContain("Community profile");
    expect(container.textContent).not.toContain("Archive community");
    const queue = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Queue");
    expect(queue).toBeDefined();
    queue!.click();
    expect(navigate).toHaveBeenCalledWith("/c/midnight/settings/moderation_queue");
  });

  test("mounts the real namespace controller for the owner address section", async () => {
    const container = render(() => (
      <OwnerSettingsRouteView
        moderationApi={moderationApi()}
        namesApi={namesApi()}
        namespaceApi={namespaceApi()}
        navigate={() => undefined}
        requestedSection="namespace"
        state={success}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Handshake root"));
    expect(container.textContent).toContain("Community address settings");
  });

  test("replaces unsupported direct links with the first authorized section", async () => {
    const navigate = vi.fn();
    render(() => (
      <OwnerSettingsRouteView
        moderationApi={moderationApi()}
        namesApi={namesApi()}
        navigate={navigate}
        requestedSection="profile"
        state={success}
      />
    ));

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(
      "/c/midnight/settings/namespace",
      { replace: true },
    ));
  });

  test("renders a redacted denied boundary without mounting management clients", () => {
    const getSnapshot = vi.fn(async () => NAMES_READY);
    const getCapabilities = vi.fn(async () => MODERATION_VIEW_AND_ACT);
    const container = render(() => (
      <OwnerSettingsRouteView
        moderationApi={{ ...moderationApi(), getCapabilities }}
        namesApi={{ ...namesApi(), getSnapshot }}
        navigate={() => undefined}
        requestedSection="names"
        state={{ kind: "denied" }}
      />
    ));

    expect(container.querySelector("[data-owner-settings-route-state='denied']")).not.toBeNull();
    expect(container.textContent).toContain("Owner access required");
    expect(getSnapshot).not.toHaveBeenCalled();
    expect(getCapabilities).not.toHaveBeenCalled();
  });

  test("loads a moderation deep link for the resolved community id", async () => {
    const getCases = vi.fn(async () => ({ cases: OPEN_MODERATION_CASES, details: OPEN_MODERATION_CASE_DETAILS }));
    const container = render(() => (
      <OwnerSettingsRouteView
        moderationApi={{ ...moderationApi(), getCases }}
        namesApi={namesApi()}
        navigate={() => undefined}
        requestedSection="moderation_queue"
        state={success}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Field recordings from the eastern breakwater"));
    expect(getCases).toHaveBeenCalledWith({ communityId: "community_midnight", view: "open" });
  });
});


test("address navigation and a reload rediscover the account import without a URL locator", async () => {
  const discovery = vi.fn(async () => ({
    community_id: success.communityId, attachment: null,
    session: { community_id: success.communityId, root_import_session_id: "session-navigation",
      root_label: "midnight", revision: 3, status: "awaiting_owner_update",
      publication_check_pending: true, retry_after_seconds: 30,
      publish_plan: { replacement_records: [] } },
  }));
  const navigate = vi.fn();
  const freshApi = () => createCommunityNamespaceSettingsApi({
    // SAFETY: The fake returns the generated pending discovery fields used by the mounted route.
    client: { get_communitiesCommunityIdHnsRootImports: discovery } as never,
    communityId: success.communityId, communityPath: success.communityPath,
    locator: { read: () => null, write: () => {}, clear: () => {} },
  });
  const mountAddress = () => render(() => <OwnerSettingsRouteView
    namespaceApi={freshApi()} namesApi={namesApi()} moderationApi={moderationApi()}
    navigate={navigate} requestedSection="namespace" state={success} />);
  const first = mountAddress();
  await vi.waitFor(() => expect(first.textContent).toContain("Checking records"));
  [...first.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Names")!.click();
  expect(navigate).toHaveBeenLastCalledWith("/c/midnight/settings/names");
  disposers.pop()!();
  const names = render(() => <OwnerSettingsRouteView namespaceApi={freshApi()} namesApi={namesApi()}
    moderationApi={moderationApi()} navigate={navigate} requestedSection="names" state={success} />);
  await vi.waitFor(() => expect(names.textContent).toContain("yourname.midnight"));
  [...names.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Address")!.click();
  expect(navigate).toHaveBeenLastCalledWith("/c/midnight/settings/namespace");
  disposers.pop()!();
  for (let visit = 0; visit < 2; visit += 1) {
    const returned = mountAddress();
    await vi.waitFor(() => expect(returned.textContent).toContain("Checking records"));
    expect(returned.textContent).not.toContain("Handshake root");
    disposers.pop()!();
  }
  expect(discovery).toHaveBeenCalledTimes(3);
});
