import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { PrivySessionExchange } from "../../api/privy-session.ts";
import { onSessionRefreshed, refreshSession } from "../../api/session.ts";
import type { CommunityCreationApi } from "./community-creation-api";
import { CommunityCreationRouteView, communityCreationCanUsePersona } from "./community-creation-route-view";
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
    expect(container.querySelector("[aria-label='Loading community creation']")).toBeNull();
    expect(container.querySelector("[data-create-community]")).not.toBeNull();
    expect(container.querySelector(".h-dvh")).toBeNull();
  });

  test("keeps the form visible while requiring sign-in to submit", async () => {
    const container = render(() => (
      <CommunityCreationRouteView api={api()} resolveSession={async () => "anonymous"} />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Sign in to create a community"));
    expect(container.querySelector("[data-create-community]")).not.toBeNull();
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

  test("keeps the draft editable when session resolution fails and recovers on retry", async () => {
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
    expect(container.textContent).toContain("Could not check your account");
    expect(container.querySelector("[data-create-community]")).not.toBeNull();
    expect(container.textContent).not.toContain("Sign in to create a community");

    const retry = [...route().querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Retry account check")!;
    retry.click();

    await vi.waitFor(() => expect(route().getAttribute("data-creation-state")).toBe("signed-out"));
    expect(attempt).toBe(2);
  });

  test("preserves typed fields and the mounted input through a delayed session and refresh failure", async () => {
    let settle!: (value: import("../../api/session").SessionResolution) => void;
    let attempt = 0;
    const client = api({ createIntent: vi.fn() });
    const authenticated = {
      status: "authenticated" as const,
      userId: "user-1",
      personas: [{ personaId: "persona-1", displayName: "Host", avatarRef: null,
        primaryPublicHandle: null, communityBinding: null }],
    };
    const container = render(() => <CommunityCreationRouteView api={client} resolveSession={() => {
      attempt += 1;
      if (attempt === 2) return Promise.reject(new Error("network"));
      return new Promise(resolve => { settle = resolve; });
    }} />);
    const name = container.querySelector<HTMLInputElement>("input")!;
    const description = container.querySelector<HTMLTextAreaElement>("textarea")!;
    name.value = "My community";
    name.dispatchEvent(new InputEvent("input", { bubbles: true }));
    description.value = "Keep this description";
    description.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const submit = () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit().disabled).toBe(true);
    await vi.waitFor(() => expect(settle).toBeTypeOf("function"));
    settle(authenticated);
    await vi.waitFor(() => expect(submit().disabled).toBe(false));
    expect(container.querySelector("input")).toBe(name);
    expect(name.value).toBe("My community");
    expect(description.value).toBe("Keep this description");

    refreshSession();
    await vi.waitFor(() => expect(container.textContent).toContain("Could not check your account"));
    expect(submit().disabled).toBe(false);
    expect(container.querySelector("input")).toBe(name);
    expect(name.value).toBe("My community");
    expect(client.createIntent).not.toHaveBeenCalled();
    const retry = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Retry account check")!;
    retry.click();
    await vi.waitFor(() => expect(attempt).toBe(3));
    settle(authenticated);
    await vi.waitFor(() => expect(submit().disabled).toBe(false));
    expect(container.querySelector("input")).toBe(name);
    expect(name.value).toBe("My community");
    expect(description.value).toBe("Keep this description");
  });

  test("does not submit using a persona from the previous session", async () => {
    let authenticated = true;
    const createIntentRequest = vi.fn();
    const container = render(() => <CommunityCreationRouteView
      api={api({ createIntent: createIntentRequest })}
      resolveSession={async () => ({ status: "authenticated", userId: authenticated ? "user-1" : "user-2",
        personas: authenticated ? [{ personaId: "persona-1", displayName: "Host", avatarRef: null,
          primaryPublicHandle: null, communityBinding: null }] : [] })}
    />);
    const name = container.querySelector<HTMLInputElement>("input")!;
    name.value = "My community";
    name.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const submit = () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await vi.waitFor(() => expect(submit().disabled).toBe(false));
    authenticated = false;
    refreshSession();
    await vi.waitFor(() => expect(container.querySelector("main")?.getAttribute("data-creation-state")).toBe("ready"));
    await vi.waitFor(() => expect(submit().disabled).toBe(true));
    expect(name.value).toBe("My community");
    expect(communityCreationCanUsePersona({ status: "authenticated", userId: "user-2", personas: [] },
      { kind: "existing", personaId: "persona-1" })).toBe(false);
    expect(communityCreationCanUsePersona(undefined, { kind: "existing", personaId: "persona-1" })).toBe(false);
    expect(createIntentRequest).not.toHaveBeenCalled();
  });

  test("resumes a saved intent without exposing a new editable form and retains progress during refresh", async () => {
    let resolveAccount!: (value: import("../../api/session").SessionResolution) => void;
    let resolveIntent!: (value: ReturnType<typeof createIntent>) => void;
    const authenticated = { status: "authenticated" as const, userId: "user-1", personas: [] };
    const client = api({ getIntent: vi.fn(() => new Promise<ReturnType<typeof createIntent>>(resolve => { resolveIntent = resolve; })) });
    const container = render(() => <CommunityCreationRouteView api={client} intentId="saved-1"
      resolveSession={() => new Promise(resolve => { resolveAccount = resolve; })} />);
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).toContain("Resume community creation");
    await vi.waitFor(() => expect(resolveAccount).toBeTypeOf("function"));
    resolveAccount(authenticated);
    await vi.waitFor(() => expect(resolveIntent).toBeTypeOf("function"));
    expect(container.querySelector("form")).toBeNull();
    resolveIntent(createIntent({ intentId: "saved-1", nextAction: { kind: "commit" } }));
    await vi.waitFor(() => expect(container.querySelector("[data-community-creation-progress]")).not.toBeNull());
    const progress = container.querySelector("[data-community-creation-progress]");
    refreshSession();
    await vi.waitFor(() => expect(progress?.querySelector("button")?.disabled).toBe(true));
    expect(container.querySelector("[data-community-creation-progress]")).toBe(progress);
    expect(container.querySelector("form")).toBeNull();
    resolveAccount(authenticated);
    await vi.waitFor(() => expect(progress?.querySelector("button")?.disabled).toBe(false));
    expect(container.querySelector("[data-community-creation-progress]")).toBe(progress);
    expect(client.getIntent).toHaveBeenCalledOnce();
  });

  test("requires an explicit creation click after sign-in and retains subsequent draft edits", async () => {
    let authenticated = false;
    const request = vi.fn();
    const createIntentRequest = vi.fn(async () => createIntent());
    window.addEventListener(GLOBAL_SIGN_IN_EVENT, request);
    try {
      const container = render(() => <CommunityCreationRouteView api={api({ createIntent: createIntentRequest })}
        navigate={() => {}}
        resolveSession={async () => authenticated ? ({ status: "authenticated", userId: "user-1",
          personas: [{ personaId: "persona-1", displayName: "Host", avatarRef: null,
            primaryPublicHandle: null, communityBinding: null }] }) : "anonymous"} />);
      await vi.waitFor(() => expect(container.querySelector("main")?.getAttribute("data-creation-state")).toBe("signed-out"));
      const name = container.querySelector<HTMLInputElement>("input")!;
      name.value = "Retained community";
      name.dispatchEvent(new InputEvent("input", { bubbles: true }));
      const button = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      await vi.waitFor(() => expect(button.disabled).toBe(false));
      expect(button.textContent).toContain("Sign in to create");
      button.click();
      expect(request).toHaveBeenCalledOnce();
      expect(createIntentRequest).not.toHaveBeenCalled();
      // Dismissing sign-in leaves no deferred creation, including after edits
      // and a later sign-in from elsewhere in the shell.
      name.value = "Edited community";
      name.dispatchEvent(new InputEvent("input", { bubbles: true }));
      authenticated = true;
      refreshSession();
      await vi.waitFor(() => expect(button.textContent?.trim()).toBe("Create"));
      expect(name.value).toBe("Edited community");
      expect(container.textContent).toContain("Host");
      expect(createIntentRequest).not.toHaveBeenCalled();
      button.click();
      await vi.waitFor(() => expect(createIntentRequest).toHaveBeenCalledOnce());
      expect(createIntentRequest).toHaveBeenCalledWith(expect.objectContaining({ draft: expect.objectContaining({ name: "Edited community", persona: { kind: "existing", personaId: "persona-1" } }) }));
    } finally {
      window.removeEventListener(GLOBAL_SIGN_IN_EVENT, request);
    }
  });

  test("account retry never creates and background recovery preserves a creation error", async () => {
    let unavailable = true;
    const createIntentRequest = vi.fn(async () => { throw new Error("write failed"); });
    const container = render(() => <CommunityCreationRouteView api={api({ createIntent: createIntentRequest })}
      resolveSession={async () => {
        if (unavailable) throw new Error("account unavailable");
        return { status: "authenticated", userId: "user-1", personas: [{ personaId: "persona-1", displayName: "Host",
          avatarRef: null, primaryPublicHandle: null, communityBinding: null }] };
      }} />);
    await vi.waitFor(() => expect(container.textContent).toContain("Could not check your account"));
    const name = container.querySelector<HTMLInputElement>("input")!;
    name.value = "Retained community";
    name.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const button = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    expect(button.textContent).toContain("Retry account check");
    unavailable = false;
    button.click();
    await vi.waitFor(() => expect(button.textContent?.trim()).toBe("Create"));
    expect(createIntentRequest).not.toHaveBeenCalled();
    button.click();
    await vi.waitFor(() => expect(container.textContent).toContain("Could not create this community draft"));
    refreshSession();
    await vi.waitFor(() => expect(button.textContent?.trim()).toBe("Create"));
    expect(container.textContent).toContain("Could not create this community draft");
    expect(createIntentRequest).toHaveBeenCalledOnce();
  });

  test("profile retry recovers selection without creating a community", async () => {
    let attempts = 0;
    const createIntentRequest = vi.fn(async () => createIntent());
    const container = render(() => <CommunityCreationRouteView
      api={api({ createIntent: createIntentRequest })}
      resolveSession={async () => ++attempts === 1
        ? { status: "authenticated", userId: "user-1", personas: [], personasUnavailable: true }
        : { status: "authenticated", userId: "user-1", personas: [{ personaId: "persona-1", displayName: "Host",
          avatarRef: null, primaryPublicHandle: null, communityBinding: null }] }} />);
    await vi.waitFor(() => expect(container.textContent).toContain("community profiles could not be loaded"));
    const name = container.querySelector<HTMLInputElement>("input")!;
    name.value = "Retained community";
    name.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const button = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    expect(button.textContent).toContain("Retry profiles");
    button.click();
    await vi.waitFor(() => expect(button.textContent?.trim()).toBe("Create"));
    expect(attempts).toBe(2);
    expect(name.value).toBe("Retained community");
    expect(container.textContent).toContain("Host");
    expect(createIntentRequest).not.toHaveBeenCalled();
  });

  test("the initial account check disables submission without hiding the form", async () => {
    let settle!: (value: import("../../api/session").SessionResolution) => void;
    const createIntentRequest = vi.fn();
    const container = render(() => <CommunityCreationRouteView api={api({ createIntent: createIntentRequest })}
      resolveSession={() => new Promise(resolve => { settle = resolve; })} />);
    const name = container.querySelector<HTMLInputElement>("input")!;
    name.value = "Pending community";
    name.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const button = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await vi.waitFor(() => expect(button.textContent).toContain("Checking account"));
    expect(button.disabled).toBe(true);
    button.click();
    settle({ status: "authenticated", userId: "user-1", personas: [{ personaId: "persona-1", displayName: "Host",
      avatarRef: null, primaryPublicHandle: null, communityBinding: null }] });
    await vi.waitFor(() => expect(button.textContent?.trim()).toBe("Create"));
    expect(createIntentRequest).not.toHaveBeenCalled();
    expect(container.querySelector("input")).toBe(name);
  });

  test("reports a session change during creation instead of silently committing under another account", async () => {
    let account = "user-1";
    let finishCreate!: (value: ReturnType<typeof createIntent>) => void;
    const commitIntent = vi.fn();
    const client = api({ createIntent: vi.fn(() => new Promise<ReturnType<typeof createIntent>>(resolve => { finishCreate = resolve; })), commitIntent });
    const container = render(() => <CommunityCreationRouteView api={client} navigate={() => {}}
      resolveSession={async () => ({ status: "authenticated", userId: account,
        personas: [{ personaId: "persona-1", displayName: "Host", avatarRef: null,
          primaryPublicHandle: null, communityBinding: null }] })} />);
    await vi.waitFor(() => expect(container.querySelector("main")?.getAttribute("data-creation-state")).toBe("ready"));
    const name = container.querySelector<HTMLInputElement>("input")!;
    name.value = "Retained draft";
    name.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await vi.waitFor(() => expect(submit.disabled).toBe(false));
    submit.click();
    await vi.waitFor(() => expect(finishCreate).toBeTypeOf("function"));
    account = "user-2";
    refreshSession();
    await vi.waitFor(() => expect(container.querySelector("main")?.getAttribute("data-creation-state")).toBe("ready"));
    finishCreate(createIntent({ nextAction: { kind: "commit" } }));
    await vi.waitFor(() => expect(container.textContent).toContain("Check your account before finishing"));
    expect(commitIntent).not.toHaveBeenCalled();
  });

  test("blocks creation without an eligible persona while activation is unavailable", async () => {
    const client = api();
    vi.spyOn(client, "createIntent");
    const container = render(() => (
      <CommunityCreationRouteView
        api={client}
        resolveSession={async () => ({ personas: [], status: "authenticated", userId: "user-1" })}
      />
    ));

    const route = () => container.querySelector("[data-route-path='/communities/new']")!;
    await vi.waitFor(() => expect(route().getAttribute("data-creation-state")).toBe("ready"));
    expect(container.textContent).not.toContain("Create a persona first");
    expect(container.textContent).toContain("coming soon");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    container.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(client.createIntent).not.toHaveBeenCalled();
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
        communityBinding: null,
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
            communityBinding: null,
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
    const refreshed = vi.fn();
    disposers.push(onSessionRefreshed(refreshed));
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
            communityBinding: null,
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
    expect(refreshed).toHaveBeenCalledOnce();
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
            communityBinding: null,
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
            communityBinding: null,
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
            communityBinding: null,
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
            communityBinding: null,
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
