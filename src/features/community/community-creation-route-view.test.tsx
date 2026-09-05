import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { PrivySessionExchange } from "../../api/privy-session.ts";
import { refreshSession } from "../../api/session.ts";
import type { CommunityCreationApi } from "./community-creation-api";
import { CommunityCreationRouteView } from "./community-creation-route-view";
import { createIntent } from "./community-creation-progress/community-creation-progress-model";
import {
  GLOBAL_SIGN_IN_EVENT,
  GlobalSignInHost,
  requestGlobalSignIn,
} from "../auth/global-sign-in-host";

const disposers: Array<() => void> = [];

function signInExchange(): PrivySessionExchange {
  return {
    beginOAuth: async () => "https://privy.example.test/authorize",
    clear: () => {},
    completeOAuth: async () => undefined,
    loginWithCode: async () => undefined,
    loginWithWallet: async () => undefined,
    register: async () => undefined,
    sendCode: async () => undefined,
  };
}

function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const dispose = solidRender(ui, container);
  disposers.push(() => {
    dispose();
    container.remove();
  });
  return container;
}

function api(overrides: Partial<CommunityCreationApi> = {}): CommunityCreationApi {
  return {
    commitIntent: async () => createIntent(),
    createIntent: async () => createIntent(),
    getIntent: async () => createIntent(),
    updateIntent: async () => createIntent(),
    ...overrides,
  };
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
  document.head.replaceChildren();
});

describe("Community creation production route", () => {
  test("accepts the first global sign-in request during component setup", async () => {
    render(() => <GlobalSignInHost createExchange={async () => signInExchange()} refresh={() => {}} />);

    requestGlobalSignIn();

    await vi.waitFor(() => {
      expect(document.body.querySelector("[aria-label='Join Pirate']")).not.toBeNull();
    });
  });

  test("leaves application chrome to the root while account context resolves", () => {
    const container = render(() => (
      <CommunityCreationRouteView
        api={api()}
        resolveSession={() => new Promise(() => {})}
      />
    ));

    expect(container.querySelector("[data-media-shell]")).toBeNull();
    expect(container.querySelector("[data-route-path='/communities/new']")).not.toBeNull();
    expect(container.querySelector("[aria-label='Loading community creation']")).not.toBeNull();
    expect(container.querySelector(".h-dvh")).toBeNull();
  });

  test("requires a signed-in session", async () => {
    const container = render(() => (
      <CommunityCreationRouteView api={api()} resolveSession={async () => "anonymous"} />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Sign in to create a community"));
    expect(container.querySelector("[data-create-community]")).toBeNull();
    const route = container.querySelector("[data-route-path='/communities/new']")!;
    const signIn = [...route.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Sign in")!;
    const requested = vi.fn();
    window.addEventListener(GLOBAL_SIGN_IN_EVENT, requested);
    try {
      signIn.click();
      expect(requested).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener(GLOBAL_SIGN_IN_EVENT, requested);
    }
  });

  test("names the unavailable state when session resolution fails and recovers on retry", async () => {
    let attempt = 0;
    const container = render(() => (
      <CommunityCreationRouteView
        api={api()}
        resolveSession={async () => {
          attempt += 1;
          if (attempt === 1) throw new Error("network");
          return "anonymous";
        }}
      />
    ));

    const route = () => container.querySelector("[data-route-path='/communities/new']")!;
    await vi.waitFor(() => expect(route().getAttribute("data-creation-state")).toBe("unavailable"));
    expect(container.textContent).toContain("Community creation is unavailable");
    expect(container.textContent).not.toContain("Sign in to create a community");

    const retry = [...route().querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Try again")!;
    retry.click();

    await vi.waitFor(() => expect(route().getAttribute("data-creation-state")).toBe("signed-out"));
    expect(attempt).toBe(2);
  });

  test("opens creation with create-new for an account without an active persona", async () => {
    const container = render(() => (
      <CommunityCreationRouteView
        api={api()}
        resolveSession={async () => ({ personas: [], status: "authenticated", userId: "user-1" })}
      />
    ));

    const route = () => container.querySelector("[data-route-path='/communities/new']")!;
    await vi.waitFor(() => expect(route().getAttribute("data-creation-state")).toBe("ready"));
    expect(container.textContent).not.toContain("Create a persona first");
    expect(container.textContent).toContain("Create a new owner persona");
  });

  test("leaves the resolving fallback for every settled session outcome", async () => {
    const container = render(() => (
      <CommunityCreationRouteView api={api()} resolveSession={async () => "anonymous"} />
    ));

    const route = () => container.querySelector("[data-route-path='/communities/new']")!;
    await vi.waitFor(() => expect(route().getAttribute("data-creation-state")).not.toBe("resolving"));
    expect(container.textContent).not.toContain("Preparing community creation");
  });

  test("re-resolves the mounted route after sign-in refresh without navigation", async () => {
    let authenticated = false;
    const resolveSession = vi.fn(async () => authenticated ? ({
      personas: [{
        avatarRef: null,
        displayName: "Harbor Host",
        personaId: "persona-1",
        primaryPublicHandle: "harbor-host",
      }],
      status: "authenticated" as const,
      userId: "user-1",
    }) : "anonymous" as const);
    const container = render(() => (
      <CommunityCreationRouteView api={api()} resolveSession={resolveSession} />
    ));

    const route = () => container.querySelector("[data-route-path='/communities/new']")!;
    await vi.waitFor(() => expect(route().getAttribute("data-creation-state")).toBe("signed-out"));

    authenticated = true;
    refreshSession();

    await vi.waitFor(() => expect(route().getAttribute("data-creation-state")).toBe("ready"));
    expect(resolveSession).toHaveBeenCalledTimes(2);
    expect(container.querySelector("[data-create-community]")).not.toBeNull();
  });

  test("reuses the creation form while withholding unsupported media controls", async () => {
    const container = render(() => (
      <CommunityCreationRouteView
        api={api()}
        resolveSession={async () => ({
          personas: [{
            avatarRef: null,
            displayName: "Harbor Host",
            personaId: "persona-1",
            primaryPublicHandle: "harbor-host",
          }],
          status: "authenticated",
          userId: "user-1",
        })}
      />
    ));

    await vi.waitFor(() => expect(container.querySelector("[data-create-community]")).not.toBeNull());
    expect(container.textContent).toContain("Community profile");
    expect(container.querySelector("input[type='file']")).toBeNull();
    expect(container.textContent).toContain("Palm scan");
  });

  test("continues a submitted commit-ready draft into commit and its Community resource", async () => {
    const created = createIntent({
      intentId: "creation-new",
      nextAction: { kind: "commit" },
      revision: 2,
      status: "commit_ready",
    });
    const committed = createIntent({
      ...created,
      committedHref: "/c/community-new",
      nextAction: { kind: "none", reason: "committed" },
      revision: 3,
      status: "committed",
    });
    const createIntentRequest = vi.fn().mockResolvedValue(created);
    const commitIntent = vi.fn().mockResolvedValue(committed);
    const navigate = vi.fn();
    const container = render(() => (
      <CommunityCreationRouteView
        api={api({ commitIntent, createIntent: createIntentRequest })}
        navigate={navigate}
        resolveSession={async () => ({
          personas: [{
            avatarRef: null,
            displayName: "Harbor Host",
            personaId: "persona-1",
            primaryPublicHandle: "harbor-host",
          }],
          status: "authenticated",
          userId: "user-1",
        })}
      />
    ));

    await vi.waitFor(() => expect(container.querySelector("[data-create-community]")).not.toBeNull());
    const name = container.querySelector<HTMLInputElement>("input")!;
    name.value = "Community New";
    name.dispatchEvent(new InputEvent("input", { bubbles: true, data: "Community New", inputType: "insertText" }));
    const submit = container.querySelector<HTMLButtonElement>("button[type='submit']")!;
    await vi.waitFor(() => expect(submit.disabled).toBe(false));
    submit.click();

    await vi.waitFor(() => expect(navigate).toHaveBeenLastCalledWith("/c/community-new", undefined));
    expect(createIntentRequest).toHaveBeenCalledOnce();
    expect(commitIntent).toHaveBeenCalledWith(expect.objectContaining({
      expectedRevision: 2,
      intentId: "creation-new",
    }));
    expect(navigate).toHaveBeenNthCalledWith(
      1,
      "/communities/new?intent_id=creation-new",
      { replace: true },
    );
    expect(navigate.mock.invocationCallOrder[0]).toBeLessThan(commitIntent.mock.invocationCallOrder[0]!);
  });

  test("does not commit a commit-ready intent merely because its URL was loaded", async () => {
    const ready = createIntent({
      intentId: "creation-resumed",
      nextAction: { kind: "commit" },
      revision: 4,
      status: "commit_ready",
    });
    const commitIntent = vi.fn();
    const container = render(() => (
      <CommunityCreationRouteView
        api={api({ commitIntent, getIntent: async () => ready })}
        intentId="creation-resumed"
        resolveSession={async () => ({
          personas: [{
            avatarRef: null,
            displayName: "Harbor Host",
            personaId: "persona-1",
            primaryPublicHandle: "harbor-host",
          }],
          status: "authenticated",
          userId: "user-1",
        })}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Ready to create"));
    expect(container.textContent).toContain("Create community");
    expect(commitIntent).not.toHaveBeenCalled();
  });

  test("leaves a failed chained commit on an explicit retry surface", async () => {
    const created = createIntent({
      intentId: "creation-retry",
      nextAction: { kind: "commit" },
      revision: 5,
      status: "commit_ready",
    });
    const commitIntent = vi.fn().mockRejectedValue(new Error("unavailable"));
    const navigate = vi.fn();
    const container = render(() => (
      <CommunityCreationRouteView
        api={api({ commitIntent, createIntent: async () => created })}
        navigate={navigate}
        resolveSession={async () => ({
          personas: [{
            avatarRef: null,
            displayName: "Harbor Host",
            personaId: "persona-1",
            primaryPublicHandle: "harbor-host",
          }],
          status: "authenticated",
          userId: "user-1",
        })}
      />
    ));

    await vi.waitFor(() => expect(container.querySelector("[data-create-community]")).not.toBeNull());
    const name = container.querySelector<HTMLInputElement>("input")!;
    name.value = "Retry Harbor";
    name.dispatchEvent(new InputEvent("input", { bubbles: true, data: "Retry Harbor", inputType: "insertText" }));
    const submit = container.querySelector<HTMLButtonElement>("button[type='submit']")!;
    await vi.waitFor(() => expect(submit.disabled).toBe(false));
    submit.click();

    await vi.waitFor(() => expect(container.textContent).toContain("Could not finish creating this community"));
    expect(navigate).toHaveBeenCalledWith(
      "/communities/new?intent_id=creation-retry",
      { replace: true },
    );
    expect(container.querySelector("[data-community-creation-progress] button")?.textContent?.trim())
      .toBe("Create community");
  });

  test("refreshes a conflicted commit while keeping the stale revision warning visible", async () => {
    const initial = createIntent({
      intentId: "creation-1",
      nextAction: { kind: "commit" },
      revision: 1,
      status: "commit_ready",
    });
    const refreshed = createIntent({ ...initial, revision: 2 });
    const getIntent = vi.fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(refreshed);
    const commitIntent = vi.fn().mockRejectedValue({ status: 409 });
    const container = render(() => (
      <CommunityCreationRouteView
        api={api({ commitIntent, getIntent })}
        intentId="creation-1"
        resolveSession={async () => ({
          personas: [{
            avatarRef: null,
            displayName: "Harbor Host",
            personaId: "persona-1",
            primaryPublicHandle: "harbor-host",
          }],
          status: "authenticated",
          userId: "user-1",
        })}
      />
    ));

    await vi.waitFor(() => expect(container.querySelector("[data-community-creation-progress]")).not.toBeNull());
    const route = container.querySelector("[data-route-path='/communities/new']")!;
    const commitButton = route.querySelector<HTMLButtonElement>("[data-community-creation-progress] button")!;
    expect(commitButton.textContent?.trim()).toBe("Create community");
    commitButton.click();

    await vi.waitFor(() => expect(container.textContent).toContain("This creation changed"));
    expect(commitIntent).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 1 }));
    expect(getIntent).toHaveBeenCalledTimes(2);
  });

  test("does not offer the retired creator ceremony for a pre-boundary intent", async () => {
    const verification = createIntent({
      intentId: "creation-1",
      nextAction: { kind: "blocked", reason: "pre_boundary_verification" },
      revision: 7,
      status: "verification_required",
    });
    const navigate = vi.fn();
    const container = render(() => (
      <CommunityCreationRouteView
        api={api({ getIntent: async () => verification })}
        intentId="creation-1"
        navigate={navigate}
        resolveSession={async () => ({
          personas: [{
            avatarRef: null,
            displayName: "Harbor Host",
            personaId: "persona-1",
            primaryPublicHandle: "harbor-host",
          }],
          status: "authenticated",
          userId: "user-1",
        })}
      />
    ));

    await vi.waitFor(() => expect(container.querySelector("[data-community-creation-progress]")).not.toBeNull());
    expect(container.textContent).toContain("This older draft cannot be completed here");
    expect(container.textContent).not.toContain("Start verification");
    expect(navigate).not.toHaveBeenCalled();
  });
});
