import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { PrivySessionExchange } from "../../api/privy-session.ts";
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
    render(() => <GlobalSignInHost createExchange={async () => signInExchange()} reload={() => {}} />);

    requestGlobalSignIn();

    await vi.waitFor(() => {
      expect(document.body.querySelector("[aria-label='Join Pirate']")).not.toBeNull();
    });
  });

  test("keeps the application shell visible while account context resolves", () => {
    const container = render(() => (
      <CommunityCreationRouteView
        api={api()}
        resolveSession={() => new Promise(() => {})}
      />
    ));

    expect(container.querySelector("[data-media-shell]")).not.toBeNull();
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
    expect(container.querySelector("[data-shell-auth='authenticated']")).not.toBeNull();
    expect(container.textContent).toContain("Community profile");
    expect(container.querySelector("input[type='file']")).toBeNull();
    expect(container.textContent).toContain("Palm scan");
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
});
