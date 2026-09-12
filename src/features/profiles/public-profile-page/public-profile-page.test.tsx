import { describe, expect, afterEach, test, vi } from "vitest";
import type { GetPublicProfilesHandleResponse } from "@pirate/api-client";
import { render as solidRender } from "@solidjs/web";
import type { JSX } from "@solidjs/web";
import { createRoot, createSignal, type Component } from "solid-js";
import { createRouter, memoryHistory, useNavigate } from "@solidjs/router";
import PublicProfileRoute, { route as publicProfileRoute } from "../../../routes/u/[handle].tsx";
import PublicProfilePage from "./public-profile-page";
import type { PublicProfileSuccess, PublicProfileViewState } from "./public-profile-page.model";

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
  vi.unstubAllGlobals();
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

  const successState = (handle: string): PublicProfileSuccess => ({
    kind: "success",
    status: 200,
    requestedHandle: `${handle}.pirate`,
    canonicalHandle: `${handle}.pirate`,
    canonicalPath: `/u/${handle}.pirate`,
    isCanonical: true,
    profile: { displayName: `${handle} profile`, handle: `${handle}.pirate`, bio: `Bio for ${handle}` },
    communities: [{ name: `Harbor ${handle}`, href: `/c/harbor-${handle}` }],
  });

  test("updates a retained successful profile when another result arrives", async () => {
    const [state, setState] = createSignal<PublicProfileViewState>(successState("captain-one"));
    const container = render(() => <PublicProfilePage handle="captain-one" data={state()} />);
    await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("captain-one profile"));
    setState(successState("captain-two"));
    await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("captain-two profile"));
    expect(container.textContent).toContain("Bio for captain-two");
    expect(container.querySelector("a[href='/c/harbor-captain-two']")?.textContent).toBe("Harbor captain-two");
    expect(container.querySelector("[data-profile-handle]")?.textContent).toBe("@captain-two.pirate");
    const canonical = document.head.querySelector("link[rel='canonical']")?.getAttribute("href");
    expect(canonical == null ? null : new URL(canonical, window.location.origin).pathname).toBe("/u/captain-two.pirate");
    expect(document.title).toContain("captain-two.pirate");
  });

  test("updates a retained failure state when the error kind changes", async () => {
    const [state, setState] = createSignal<PublicProfileViewState>({ kind: "not-found", status: 404 });
    const container = render(() => <PublicProfilePage handle="missing" data={state()} />);
    await vi.waitFor(() => expect(container.querySelector("[data-profile-state='not-found']")).not.toBeNull());
    setState({ kind: "invalid", status: 400 });
    await vi.waitFor(() => expect(container.querySelector("[data-profile-state='invalid']")).not.toBeNull());
    expect(container.textContent).toContain("That profile handle is not valid.");
  });

  test("navigates between handles on the current route with a fresh request", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const pathname = new URL(input instanceof Request ? input.url : input.toString()).pathname;
      const handle = pathname.includes("captain-two") ? "captain-two" : "captain-one";
      return new Response(JSON.stringify({
        profile: {
          id: `profile-${handle}`,
          object: "profile",
          display_name: `${handle} profile`,
          avatar_ref: null,
          avatar_source: "upload",
          cover_ref: null,
          cover_source: "upload",
          bio: `Bio for ${handle}`,
          bio_source: "manual",
          preferred_locale: "en",
          global_handle: { id: `handle-${handle}`, object: "global_handle", label: `${handle}.pirate`, status: "active" },
          created: 1_700_000_000,
        },
        requested_handle_label: `${handle}.pirate`,
        resolved_handle_label: `${handle}.pirate`,
        is_canonical: true,
        created_communities: [{ community: `community-${handle}`, display_name: `Harbor ${handle}`, created: 1_700_000_001, route_slug: `harbor-${handle}` }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchImpl);

    let navigate: ReturnType<typeof useNavigate> | undefined;
    function RouteWithNavigation(props: Parameters<typeof PublicProfileRoute>[0]) {
      navigate = useNavigate();
      return <PublicProfileRoute {...props} />;
    }
    const history = memoryHistory("/u/captain-one.pirate");
    // SAFETY: the router supplies this route's params and preloaded data at
    // runtime; the cast only widens the section-component prop type so this
    // test harness can mount the real route component.
    const SectionComponent = RouteWithNavigation as Component<{}>;
    const TestRouter = createRouter({
      history,
      routes: [{ ...publicProfileRoute, path: "/u/:handle", component: SectionComponent }],
    });
    const container = render(() => <TestRouter>{routerProps => routerProps.children}</TestRouter>);

    await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("captain-one profile"));
    expect(fetchImpl).toHaveBeenCalledOnce();

    navigate!("/u/captain-two.pirate");
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("captain-two profile"));
    const secondInput = fetchImpl.mock.calls[1]![0];
    const secondPath = new URL(secondInput instanceof Request ? secondInput.url : String(secondInput)).pathname;
    expect(secondPath).toContain("captain-two");
    expect(container.textContent).toContain("Bio for captain-two");
    expect(container.querySelector("a[href='/c/harbor-captain-two']")?.textContent).toBe("Harbor captain-two");
    const canonical = document.head.querySelector("link[rel='canonical']")?.getAttribute("href");
    expect(canonical == null ? null : new URL(canonical, window.location.origin).pathname).toBe("/u/captain-two.pirate");
    expect(document.title).toContain("captain-two.pirate");
  });
});
