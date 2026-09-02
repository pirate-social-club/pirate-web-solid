import { describe, expect, afterEach, test, vi } from "vitest";
import type { GetPublicProfilesHandleResponse } from "@pirate/api-client";
import { render as solidRender } from "@solidjs/web";
import type { JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import PublicProfilePage from "./public-profile-page";

const disposers: Array<() => void> = [];
const initialUrl = window.location.href;

function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot(rootDispose => {
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
  window.history.replaceState(null, "", initialUrl);
  document.head.replaceChildren();
  document.body.replaceChildren();
});

const profileResponse = (communities: GetPublicProfilesHandleResponse["created_communities"] = []): GetPublicProfilesHandleResponse => ({
  profile: {
    id: "profile-1",
    object: "profile",
    display_name: "Captain One",
    avatar_ref: "avatar-ref-must-not-render",
    avatar_source: "upload",
    cover_ref: "cover-ref-must-not-render",
    cover_source: "upload",
    bio: "A public bio.",
    bio_source: "manual",
    preferred_locale: "en",
    global_handle: { id: "handle-1", object: "global_handle", label: "captain-one.pirate", status: "active" },
    created: 1_700_000_000,
  },
  requested_handle_label: "captain-one.pirate",
  resolved_handle_label: "captain-one.pirate",
  is_canonical: true,
  created_communities: communities,
});

function client(result: GetPublicProfilesHandleResponse | unknown) {
  return {
    get_publicProfilesHandle: async () => {
      if (result instanceof Error || (typeof result === "object" && result !== null && ("status" in result || "_tag" in result))) throw result;
      // SAFETY: fixtures passed to this helper are contract-shaped responses unless marked as errors above.
      return result as GetPublicProfilesHandleResponse;
    },
  };
}

describe("PublicProfilePage", () => {
  test("announces loading and then renders the narrow success projection", async () => {
    let resolve: (value: GetPublicProfilesHandleResponse) => void = () => {};
    const pending = new Promise<GetPublicProfilesHandleResponse>(done => { resolve = done; });
    const container = render(() => (
      <PublicProfilePage
        handle="captain-one"
        client={{ get_publicProfilesHandle: async () => pending }}
      />
    ));
    expect(container.querySelector("[role='status']")?.textContent).toContain("Loading profile");
    resolve(profileResponse([
      { community: "community-1", display_name: "Harbor", created: 1_700_000_001, route_slug: null },
      { community: "community-2", display_name: "Dock", created: 1_700_000_002, route_slug: "dock" },
    ]));
    await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Captain One"));
    expect(container.textContent).toContain("A public bio.");
    expect(container.textContent).toContain("Harbor");
    expect(container.querySelector("a[href='/c/dock']")).toBeTruthy();
    expect(container.querySelector("a[href^='/c/']")?.textContent).toBe("Dock");
    expect(container.textContent).not.toContain("avatar-ref-must-not-render");
    expect(container.textContent).not.toContain("cover-ref-must-not-render");
    expect(container.querySelector("button")).toBeNull();
  });

  test("renders a safe empty state without viewer controls", async () => {
    const container = render(() => <PublicProfilePage handle="captain-one" client={client(profileResponse())} />);
    await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Captain One"));
    expect(container.querySelector("[role='status']")?.textContent).toContain("No communities created yet.");
    expect(container.querySelector("button, input, textarea, [data-viewer-control]")).toBeNull();
  });

  test("renders invalid, missing, and unavailable states without raw errors", async () => {
    const invalid = render(() => <PublicProfilePage handle="bad_handle" client={client(profileResponse())} />);
    await vi.waitFor(() => expect(invalid.querySelector("[data-profile-state='invalid']")).not.toBeNull());
    expect(invalid.textContent).toContain("That profile handle is not valid.");

    const notFound = render(() => <PublicProfilePage handle="missing" client={client({ status: 404, message: "secret" })} />);
    await vi.waitFor(() => expect(notFound.querySelector("[data-profile-state='not-found']")).not.toBeNull());
    expect(notFound.textContent).toContain("This profile could not be found.");
    expect(notFound.textContent).not.toContain("secret");

    const unavailable = render(() => <PublicProfilePage handle="captain-one" client={client({ _tag: "ApiClientProtocolError", status: 500, message: "credential=secret" })} />);
    await vi.waitFor(() => expect(unavailable.querySelector("[data-profile-state='unavailable']")).not.toBeNull());
    expect(unavailable.textContent).toContain("This profile is temporarily unavailable.");
    expect(unavailable.textContent).not.toContain("credential");
  });

  test("publishes canonical metadata and renders alias as a redirect state", async () => {
    const response = profileResponse();
    const aliasResponse = { ...response, is_canonical: false, requested_handle_label: "old-name.pirate" };
    const container = render(() => <PublicProfilePage handle="old-name" client={client(aliasResponse)} />);
    await vi.waitFor(() => expect(container.querySelector("[data-profile-state='alias']")).not.toBeNull());
    const canonical = document.head.querySelector("link[rel='canonical']")?.getAttribute("href");
    const ogUrl = document.head.querySelector("meta[property='og:url']")?.getAttribute("content");
    expect(canonical == null ? null : new URL(canonical, window.location.origin).pathname).toBe("/u/captain-one.pirate");
    expect(ogUrl == null ? null : new URL(ogUrl, window.location.origin).pathname).toBe("/u/captain-one.pirate");
    expect(window.location.pathname).toBe("/u/captain-one.pirate");
    expect(container.textContent).toContain("Redirecting to captain-one.pirate");
  });

  test("uses the request locale for localized status copy", async () => {
    window.history.replaceState(null, "", "/u/bad_handle?lang=zh");
    const container = render(() => <PublicProfilePage handle="bad_handle" client={client(profileResponse())} />);
    await vi.waitFor(() => expect(container.querySelector("[data-profile-state='invalid']")).not.toBeNull());
    expect(container.textContent).toContain("该个人资料句柄无效。");
  });
});
