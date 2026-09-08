import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
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
    expect(container.querySelector("main h1")?.textContent).toBe("Community address");
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
      "/c/midnight/settings/moderation_queue",
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
  await vi.waitFor(() => expect(first.textContent).toContain("Checking published records"));
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
    await vi.waitFor(() => expect(returned.textContent).toContain("Checking published records"));
    expect(returned.textContent).not.toContain("Handshake root");
    disposers.pop()!();
  }
  expect(discovery).toHaveBeenCalledTimes(3);
});


test("keeps failed moderation visible without granting access or redirecting to names", async () => {
  const navigate = vi.fn();
  const getCases = vi.fn();
  const container = render(() => <OwnerSettingsRouteView
    state={{ ...success, access: { "community.names.manage": true }, unavailableSections: ["moderation_queue", "content_policy"] }}
    requestedSection="moderation_queue" navigate={navigate}
    moderationApi={{ ...moderationApi(), getCases }} namesApi={namesApi()}
  />);
  await vi.waitFor(() => expect(container.textContent).toContain("Your access could not be determined"));
  expect(navigate).not.toHaveBeenCalled();
  expect(getCases).not.toHaveBeenCalled();
  const nav = container.querySelector("nav")!;
  expect(nav.textContent).toContain("Names");
  expect(nav.textContent).toContain("Queue");
  expect(nav.querySelector('[aria-current="page"]')?.textContent).toContain("Queue");
  expect([...container.querySelectorAll("button")].some(button => button.textContent === "Try again")).toBe(true);
});


test("renders retryable navigation when every owner probe is unavailable", async () => {
  const navigate = vi.fn();
  const container = render(() => <OwnerSettingsRouteView
    state={{ ...success, access: {}, unavailableSections: ["moderation_queue", "content_policy", "namespace", "names"] }}
    requestedSection="moderation_queue" navigate={navigate}
  />);
  await vi.waitFor(() => expect(container.textContent).toContain("Your access could not be determined"));
  expect(container.querySelector("nav")?.textContent).toContain("Queue");
  expect(container.querySelector("nav")?.textContent).toContain("Names");
  expect(navigate).not.toHaveBeenCalled();
});

describe("management deep links", () => {
  const IMPORT_SEARCH = "?hns_import_session=hns-root-import_80dfa5c7-2d30-473a-bbfa-035de6688071";

  // Hold the document URL for the whole test: the assertions are async, so a
  // helper that restored it around render alone would read the wrong URL.
  function setLocation(search: string): void {
    const original = window.location.href;
    window.history.replaceState(null, "", `/c/midnight/settings/namespace${search}`);
    disposers.push(() => window.history.replaceState(null, "", original));
  }

  test("keeps an explicit Address deep link on Address with its import parameter", async () => {
    const navigate = vi.fn();
    setLocation(IMPORT_SEARCH);
    const container = render(() => (
      <OwnerSettingsRouteView
        namespaceApi={namespaceApi()}
        namesApi={namesApi()}
        navigate={navigate}
        requestedSection="namespace"
        state={success}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Handshake root"));
    // The import session lives only in the document URL, so the surface must
    // settle on Address without navigating at all.
    expect(navigate).not.toHaveBeenCalled();
    expect(new URL(window.location.href).searchParams.get("hns_import_session"))
      .toBe("hns-root-import_80dfa5c7-2d30-473a-bbfa-035de6688071");
  });

  test("carries the exact import parameter through a generic-entry redirect", async () => {
    const navigate = vi.fn();
    setLocation(IMPORT_SEARCH);
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
      `/c/midnight/settings/moderation_queue${IMPORT_SEARCH}`,
      { replace: true },
    ));
  });

  test("resolves a generic settings entry to Queue when authorized", async () => {
    const navigate = vi.fn();
    render(() => (
      <OwnerSettingsRouteView
        moderationApi={moderationApi()}
        namesApi={namesApi()}
        navigate={navigate}
        requestedSection=""
        state={success}
      />
    ));

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(
      "/c/midnight/settings/moderation_queue",
      { replace: true },
    ));
  });

  test("falls back to Address when the queue is not authorized", async () => {
    const navigate = vi.fn();
    render(() => (
      <OwnerSettingsRouteView
        namesApi={namesApi()}
        navigate={navigate}
        requestedSection=""
        state={{ ...success, access: { "community.names.manage": true, "community.namespace.write": true } }}
      />
    ));

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(
      "/c/midnight/settings/namespace",
      { replace: true },
    ));
  });

  test("keeps the import parameter when the owner changes section by hand", async () => {
    const navigate = vi.fn();
    setLocation(IMPORT_SEARCH);
    const container = render(() => (
      <OwnerSettingsRouteView
        moderationApi={moderationApi()}
        namesApi={namesApi()}
        namespaceApi={namespaceApi()}
        navigate={navigate}
        requestedSection="namespace"
        state={success}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Handshake root"));
    const queue = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Queue");
    expect(queue).toBeDefined();
    queue!.click();

    expect(navigate).toHaveBeenCalledWith(`/c/midnight/settings/moderation_queue${IMPORT_SEARCH}`);
  });

  test("adds no query string when the document carries none", async () => {
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
      "/c/midnight/settings/moderation_queue",
      { replace: true },
    ));
  });

  test("does not redirect when browser navigation lands on another authorized section", async () => {
    const navigate = vi.fn();
    const [requested, setRequested] = createSignal("namespace");
    setLocation(IMPORT_SEARCH);
    const container = render(() => (
      <OwnerSettingsRouteView
        moderationApi={moderationApi()}
        namesApi={namesApi()}
        namespaceApi={namespaceApi()}
        navigate={navigate}
        requestedSection={requested()}
        state={success}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Handshake root"));
    // Back or forward changes the section the router reports. Both are
    // authorized, so the view follows the URL instead of correcting it.
    setRequested("moderation_queue");
    await vi.waitFor(() => expect(container.querySelector("main h1")?.textContent).toBe("Moderation queue"));
    setRequested("namespace");
    await vi.waitFor(() => expect(container.querySelector("main h1")?.textContent).toBe("Community address"));
    expect(navigate).not.toHaveBeenCalled();
  });

  test("renders the index as a destination without correcting it to a section", async () => {
    const navigate = vi.fn();
    const container = render(() => (
      <OwnerSettingsRouteView namesApi={namesApi()} navigate={navigate} requestedSection={null} state={success} />
    ));

    await vi.waitFor(() => expect(container.querySelector("main h1")?.textContent).toBe("Community management"));
    const list = container.querySelector('nav[aria-label="All management sections"]');
    expect(list).not.toBeNull();
    expect([...list!.querySelectorAll("button")].map((button) => button.textContent?.trim().startsWith("Queue")))
      .toContain(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  test("drills from the index into a section, carrying the import parameter", async () => {
    const navigate = vi.fn();
    setLocation(IMPORT_SEARCH);
    const container = render(() => (
      <OwnerSettingsRouteView namesApi={namesApi()} navigate={navigate} requestedSection={null} state={success} />
    ));

    await vi.waitFor(() => expect(container.querySelector('nav[aria-label="All management sections"]')).not.toBeNull());
    const address = [...container.querySelectorAll<HTMLButtonElement>('nav[aria-label="All management sections"] button')]
      .find((button) => button.textContent?.includes("Address"));
    expect(address).toBeDefined();
    address!.click();

    expect(navigate).toHaveBeenCalledWith(`/c/midnight/settings/namespace${IMPORT_SEARCH}`);
  });

  test("steps a section back to the index and exits to the community", async () => {
    const navigate = vi.fn();
    setLocation(IMPORT_SEARCH);
    const container = render(() => (
      <OwnerSettingsRouteView
        namespaceApi={namespaceApi()}
        namesApi={namesApi()}
        navigate={navigate}
        requestedSection="namespace"
        state={success}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Handshake root"));
    const back = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.getAttribute("aria-label") === "Back to all sections");
    expect(back).toBeDefined();
    back!.click();
    expect(navigate).toHaveBeenCalledWith(`/c/midnight/settings${IMPORT_SEARCH}`);

    const exit = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.getAttribute("aria-label") === "Close community management");
    expect(exit).toBeDefined();
    exit!.click();
    expect(navigate).toHaveBeenCalledWith("/c/midnight");
  });

  test("the index exits to the community and offers no back control", async () => {
    const navigate = vi.fn();
    const container = render(() => (
      <OwnerSettingsRouteView namesApi={namesApi()} navigate={navigate} requestedSection={null} state={success} />
    ));

    await vi.waitFor(() => expect(container.querySelector("main h1")?.textContent).toBe("Community management"));
    expect([...container.querySelectorAll("button")]
      .some((button) => button.getAttribute("aria-label") === "Back to all sections")).toBe(false);
    const exit = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.getAttribute("aria-label") === "Close community management");
    exit!.click();
    expect(navigate).toHaveBeenCalledWith("/c/midnight");
  });

  test("keeps one heading per viewport on the index", async () => {
    const navigate = vi.fn();
    const container = render(() => (
      <OwnerSettingsRouteView namesApi={namesApi()} navigate={navigate} requestedSection={null} state={success} />
    ));

    await vi.waitFor(() => expect(container.querySelector("main h1")).not.toBeNull());
    const headings = [...container.querySelectorAll("h1")].map((heading) => heading.textContent?.trim());
    expect(headings).toEqual(["Community management", "Community management"]);
    expect(container.querySelector("main h1")?.className).toContain("md:block");
    expect(container.querySelector("header")?.className).toContain("md:hidden");
  });
});
