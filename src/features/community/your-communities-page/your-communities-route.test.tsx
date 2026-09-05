import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { AccountCommunityMembership } from "../../../api/account-community-memberships.ts";
import { YourCommunitiesRouteView } from "./your-communities-route.tsx";

const disposers: Array<() => void> = [];

Element.prototype.scrollIntoView = vi.fn();

function routeRoot(container: HTMLElement): HTMLElement {
  const root = container.querySelector<HTMLElement>("[data-route-path='/communities']");
  if (root === null) throw new Error("Communities route root was not rendered");
  return root;
}

function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot((rootDispose) => {
    dispose = rootDispose;
    solidRender(ui, container);
  });
  disposers.push(() => {
    dispose();
    container.remove();
  });
  return container;
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

const routeLessMembership: AccountCommunityMembership = {
  object: "account_community_membership",
  community_id: "community-route-less",
  display_name: "Open Sea",
  resource_href: null,
  canonical_route: null,
  membership_status: "member",
  can_post: true,
};

const routedMembership: AccountCommunityMembership = {
  ...routeLessMembership,
  community_id: "community-routed",
  display_name: "Harbor",
  canonical_route: {
    family: "spaces",
    root_label: "harbor",
    root_label_display: "harbor",
    path_segment: "harbor",
    href: "/c/harbor",
    app_host: null,
  },
};

describe("YourCommunitiesRouteView", () => {
  test("ignores posting access that completes after sign-out", async () => {
    const [session, setSession] = createSignal<
      "anonymous" | { status: "authenticated"; userId: string }
    >({ status: "authenticated", userId: "account-one" });
    let finish = (_items: readonly AccountCommunityMembership[]) => {};
    const pending = new Promise<readonly AccountCommunityMembership[]>((resolve) => {
      finish = resolve;
    });
    const loadMemberships = vi.fn()
      .mockResolvedValueOnce([routeLessMembership])
      .mockReturnValueOnce(pending);
    const resolvePostingSession = vi.fn(async () => ({
      status: "authenticated" as const, userId: "account-one", personas: [],
    }));
    const container = render(() => <YourCommunitiesRouteView
      applicationSession={session} loadMemberships={loadMemberships}
      resolvePostingSession={resolvePostingSession}
    />);
    await vi.waitFor(() => expect(container.textContent).toContain("Open Sea"));
    container.querySelector<HTMLButtonElement>("[data-post-community-id]")!.click();
    await vi.waitFor(() => expect(loadMemberships).toHaveBeenCalledTimes(2));
    setSession("anonymous");
    await vi.waitFor(() => expect(container.textContent).toContain("Sign in to choose"));
    finish([routeLessMembership]);
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolvePostingSession).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Posting in Open Sea");
  });

  test("renders an anonymous sign-in state without loading private memberships", async () => {
    const loadMemberships = vi.fn();
    const container = render(() => (
      <YourCommunitiesRouteView
        applicationSession={() => "anonymous"}
        loadMemberships={loadMemberships}
      />
    ));
    await vi.waitFor(() =>
      expect(routeRoot(container).getAttribute("data-communities-state")).toBe("anonymous"),
    );
    expect(loadMemberships).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Sign in to choose a Community and post.");
  });

  test("offers route-less members a contextual composer after a fresh membership read", async () => {
    const loadMemberships = vi.fn(async () => [routeLessMembership]);
    const resolvePostingSession = vi.fn(async () => ({
      status: "authenticated" as const,
      userId: "account-one",
      personas: [],
    }));
    const container = render(() => (
      <YourCommunitiesRouteView
        applicationSession={() => ({ status: "authenticated", userId: "account-one" })}
        loadMemberships={loadMemberships}
        resolvePostingSession={resolvePostingSession}
      />
    ));
    await vi.waitFor(() => expect(container.textContent).toContain("Open Sea"));
    expect(container.textContent).toContain("No public route");
    expect(
      container.querySelector(
        "#community-community-route-less button:not([data-post-community-id])",
      ),
    ).toBeNull();

    container
      .querySelector<HTMLButtonElement>("[data-post-community-id='community-route-less']")
      ?.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Posting in Open Sea"));
    expect(loadMemberships).toHaveBeenCalledTimes(2);
    expect(resolvePostingSession).toHaveBeenCalledOnce();
    expect(
      document.body.querySelector("[data-community-context='community-route-less']"),
    ).not.toBeNull();
  });

  test("fails closed when membership disappears before the composer opens", async () => {
    const loadMemberships = vi
      .fn()
      .mockResolvedValueOnce([routeLessMembership])
      .mockResolvedValueOnce([]);
    const resolvePostingSession = vi.fn();
    const container = render(() => (
      <YourCommunitiesRouteView
        applicationSession={() => ({ status: "authenticated", userId: "account-one" })}
        loadMemberships={loadMemberships}
        resolvePostingSession={resolvePostingSession}
      />
    ));
    await vi.waitFor(() => expect(container.textContent).toContain("Open Sea"));
    container
      .querySelector<HTMLButtonElement>("[data-post-community-id='community-route-less']")
      ?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("no longer post"));
    expect(resolvePostingSession).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Posting in Open Sea");
  });

  test("reacts to hydration session transitions", async () => {
    const [session, setSession] = createSignal<
      "resolving" | { status: "authenticated"; userId: string }
    >("resolving");
    const loadMemberships = vi.fn(async () => [routeLessMembership]);
    const container = render(() => (
      <YourCommunitiesRouteView applicationSession={session} loadMemberships={loadMemberships} />
    ));
    expect(routeRoot(container).getAttribute("data-communities-state")).toBe("loading");
    setSession({ status: "authenticated", userId: "account-one" });
    await vi.waitFor(() =>
      expect(routeRoot(container).getAttribute("data-communities-state")).toBe("ready"),
    );
    expect(loadMemberships).toHaveBeenCalledOnce();
  });

  test("navigates only through a server-provided route", async () => {
    const navigate = vi.fn();
    const container = render(() => (
      <YourCommunitiesRouteView
        applicationSession={() => ({ status: "authenticated", userId: "account-one" })}
        loadMemberships={async () => [routedMembership]}
        navigate={navigate}
      />
    ));
    await vi.waitFor(() => expect(container.textContent).toContain("Harbor"));
    container.querySelector<HTMLButtonElement>("#community-community-routed button:not([data-post-community-id])")?.click();
    expect(navigate).toHaveBeenCalledWith("/c/harbor");
  });

  test("renders an explicit empty-membership state", async () => {
    const container = render(() => (
      <YourCommunitiesRouteView
        applicationSession={() => ({ status: "authenticated", userId: "account-one" })}
        loadMemberships={async () => []}
      />
    ));
    await vi.waitFor(() =>
      expect(routeRoot(container).getAttribute("data-communities-state")).toBe("ready"),
    );
    expect(container.textContent).toContain("You aren't an active member of a Community yet.");
  });
});
