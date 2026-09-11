import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { PrivySessionExchange } from "../../api/privy-session.ts";
import { onSessionRefreshed, refreshSession } from "../../api/session.ts";
import type { CommunityCreationApi } from "./community-creation-api";
import { CommunityCreationRouteView, communityCreationCanUsePersona } from "./community-creation-route-view";
import { createIntent as createIntentView } from "./community-creation-progress/community-creation-progress-model";
import {
  GLOBAL_SIGN_IN_EVENT,
  GlobalSignInHost,
  requestGlobalSignIn,
} from "../auth/global-sign-in-host";

function createIntent(overrides: Parameters<typeof createIntentView>[0] = {}) {
  return createIntentView({ expiresAt: new Date(Date.now() + 86_400_000).toISOString(), draft: { name: "Saved community", publicName: "River Room", description: "Saved description", persona: { kind: "create_new" }, additionalRequirements: [] }, ...overrides });
}

function fillPublicName(container: HTMLElement) {
  const field = container.querySelectorAll<HTMLInputElement>("input")[1];
  if (field) { field.value = "River Room"; field.dispatchEvent(new InputEvent("input", { bubbles: true })); }
}

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

    await vi.waitFor(() => expect(container.querySelector("main")?.getAttribute("data-creation-state")).toBe("signed-out"));
    expect(container.querySelector("[data-create-community]")).not.toBeNull();
    const route = container.querySelector("[data-route-path='/communities/new']")!;
    const signIn = [...route.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.type === "submit")!;
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
      .find(button => button.textContent?.trim() === "Try again")!;
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
    fillPublicName(container);
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
      .find(button => button.textContent?.trim() === "Try again")!;
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
    fillPublicName(container);
    const submit = () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await vi.waitFor(() => expect(submit().disabled).toBe(false));
    authenticated = false;
    refreshSession();
    await vi.waitFor(() => expect(container.querySelector("main")?.getAttribute("data-creation-state")).toBe("ready"));
    await vi.waitFor(() => expect(submit().disabled).toBe(false));
    expect(name.value).toBe("My community");
    expect(communityCreationCanUsePersona({ status: "authenticated", userId: "user-2", personas: [] },
      { kind: "existing", personaId: "persona-1" })).toBe(false);
    expect(communityCreationCanUsePersona(undefined, { kind: "existing", personaId: "persona-1" })).toBe(false);
    expect(createIntentRequest).not.toHaveBeenCalled();
  });

  test("restores a saved setup in the same disabled form and retains it during refresh", async () => {
    let resolveAccount!: (value: import("../../api/session").SessionResolution) => void;
    let resolveIntent!: (value: ReturnType<typeof createIntent>) => void;
    const authenticated = { status: "authenticated" as const, userId: "user-1", personas: [] };
    const client = api({ getIntent: vi.fn(() => new Promise<ReturnType<typeof createIntent>>(resolve => { resolveIntent = resolve; })) });
    const container = render(() => <CommunityCreationRouteView api={client} intentId="saved-1"
      resolveSession={() => new Promise(resolve => { resolveAccount = resolve; })} />);
    const form = container.querySelector("form");
    const name = container.querySelector<HTMLInputElement>("input")!;
    expect(form).not.toBeNull();
    expect(name.closest("fieldset")?.disabled).toBe(true);
    expect(container.textContent).not.toContain("Resume community creation");
    await vi.waitFor(() => expect(resolveAccount).toBeTypeOf("function"));
    resolveAccount(authenticated);
    await vi.waitFor(() => expect(resolveIntent).toBeTypeOf("function"));
    resolveIntent(createIntent({ intentId: "saved-1", nextAction: { kind: "commit" } }));
    await vi.waitFor(() => expect(name.value).toBe("Saved community"));
    expect(container.querySelector("form")).toBe(form);
    refreshSession();
    expect(container.querySelector("input")).toBe(name);
    resolveAccount(authenticated);
    await vi.waitFor(() => expect(client.getIntent).toHaveBeenCalledTimes(2));
    expect(name.value).toBe("Saved community");
    expect(container.querySelector("form")).toBe(form);
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
    fillPublicName(container);
      const button = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      await vi.waitFor(() => expect(button.disabled).toBe(false));
      expect(button.textContent?.trim()).toBe("Create");
      button.click();
      expect(request).toHaveBeenCalledOnce();
      expect(createIntentRequest).not.toHaveBeenCalled();
      // Dismissing sign-in leaves no deferred creation, including after edits
      // and a later sign-in from elsewhere in the shell.
      name.value = "Edited community";
      name.dispatchEvent(new InputEvent("input", { bubbles: true }));
    fillPublicName(container);
      authenticated = true;
      refreshSession();
      await vi.waitFor(() => expect(button.disabled).toBe(false));
    expect(button.textContent?.trim()).toBe("Create");
      expect(name.value).toBe("Edited community");
      await vi.waitFor(() => expect(container.textContent).toContain("Use an existing profile"));
      expect(createIntentRequest).not.toHaveBeenCalled();
      button.click();
      await vi.waitFor(() => expect(createIntentRequest).toHaveBeenCalledOnce());
      expect(createIntentRequest).toHaveBeenCalledWith(expect.objectContaining({ draft: expect.objectContaining({ name: "Edited community", publicName: "River Room", persona: { kind: "create_new" } }) }));
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
    fillPublicName(container);
    const button = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    expect(button.textContent?.trim()).toBe("Create");
    unavailable = false;
    button.click();
    await vi.waitFor(() => expect(container.querySelector("main")?.getAttribute("data-creation-state")).toBe("ready"));
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    expect(button.textContent?.trim()).toBe("Create");
    expect(createIntentRequest).not.toHaveBeenCalled();
    button.click();
    await vi.waitFor(() => expect(container.textContent).toContain("Couldn't create your community"));
    refreshSession();
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    expect(button.textContent?.trim()).toBe("Create");
    expect(container.textContent).toContain("Couldn't create your community");
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
    await vi.waitFor(() => expect(container.textContent).toContain("Could not load your existing profiles"));
    const name = container.querySelector<HTMLInputElement>("input")!;
    name.value = "Retained community";
    name.dispatchEvent(new InputEvent("input", { bubbles: true }));
    fillPublicName(container);
    const button = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    expect(button.textContent).toContain("Create");
    const retryProfiles = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Try again")!;
    retryProfiles.click();
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    expect(button.textContent?.trim()).toBe("Create");
    expect(attempts).toBe(2);
    expect(name.value).toBe("Retained community");
    await vi.waitFor(() => expect(container.textContent).toContain("Use an existing profile"));
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
    fillPublicName(container);
    const button = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(button.textContent?.trim()).toBe("Create");
    await vi.waitFor(() => expect(settle).toBeTypeOf("function"));
    expect(button.disabled).toBe(true);
    button.click();
    settle({ status: "authenticated", userId: "user-1", personas: [{ personaId: "persona-1", displayName: "Host",
      avatarRef: null, primaryPublicHandle: null, communityBinding: null }] });
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    expect(button.textContent?.trim()).toBe("Create");
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
    fillPublicName(container);
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

  test("requires a public name for a fresh profile without an existing usable profile", async () => {
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
    expect(container.textContent).not.toContain("coming soon");
    expect(container.textContent).toContain("Public name");
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
    expect(container.textContent).toContain("Your profile here");
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
    fillPublicName(container);
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

    await vi.waitFor(() => expect(container.querySelector<HTMLInputElement>("input")?.value).toBe("Saved community"));
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
    fillPublicName(container);
    const submit = container.querySelector<HTMLButtonElement>("button[type='submit']")!;
    await vi.waitFor(() => expect(submit.disabled).toBe(false));
    submit.click();

    await vi.waitFor(() => expect(container.textContent).toContain("Could not finish creating this community"));
    expect(navigate).toHaveBeenCalledWith(
      "/communities/new?intent_id=creation-retry",
      { replace: true },
    );
    expect(container.querySelector("button[type=submit]")?.textContent?.trim())
      .toBe("Create");
  });

  test("refreshes a conflicted commit and preserves a failure message", async () => {
    const initial = createIntent({
      intentId: "creation-1",
      nextAction: { kind: "commit" },
      revision: 1,
      status: "commit_ready",
    });
    const refreshed = createIntent({ ...initial, revision: 2 });
    const getIntent = vi.fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(initial)
      .mockResolvedValue(refreshed);
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

    await vi.waitFor(() => expect(container.querySelector<HTMLButtonElement>("button[type=submit]")?.disabled).toBe(false));
    const route = container.querySelector("[data-route-path='/communities/new']")!;
    const commitButton = route.querySelector<HTMLButtonElement>("button[type=submit]")!;
    expect(commitButton.textContent?.trim()).toBe("Create");
    commitButton.click();

    await vi.waitFor(() => expect(container.textContent).toContain("Could not finish creating this community"));
    expect(commitIntent).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 1 }));
    expect(getIntent).toHaveBeenCalledTimes(3);
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

    await vi.waitFor(() => expect(container.querySelector<HTMLButtonElement>("button[type=submit]")?.disabled).toBe(false));
    expect(container.textContent).toContain("This community setup cannot be completed here");
    expect(container.textContent).not.toContain("Start verification");
    expect(navigate).not.toHaveBeenCalled();
  });

  test("explains a quota-blocked commit and keeps Create disabled", async () => {
    const created = createIntent({
      intentId: "creation-quota",
      nextAction: { kind: "commit" },
      revision: 2,
      status: "commit_ready",
    });
    const blocked = createIntent({
      ...created,
      nextAction: { kind: "blocked", reason: "quota_exceeded" },
      revision: 3,
      status: "quota_exceeded",
    });
    const commitIntent = vi.fn().mockResolvedValue(blocked);
    const container = render(() => (
      <CommunityCreationRouteView
        api={api({ commitIntent, createIntent: async () => created })}
        navigate={() => {}}
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
    name.value = "Quota Community";
    name.dispatchEvent(new InputEvent("input", { bubbles: true }));
    fillPublicName(container);
    const submit = container.querySelector<HTMLButtonElement>("button[type='submit']")!;
    await vi.waitFor(() => expect(submit.disabled).toBe(false));
    submit.click();

    await vi.waitFor(() => expect(container.textContent).toContain("You've reached the limit for new communities."));
    expect(commitIntent).toHaveBeenCalledOnce();
    expect(container.querySelector<HTMLButtonElement>("button[type='submit']")?.disabled).toBe(true);
  });

  test("shows the quota reason when a saved intent reloads blocked", async () => {
    const blocked = createIntent({
      intentId: "creation-quota",
      nextAction: { kind: "blocked", reason: "quota_exceeded" },
      revision: 3,
      status: "quota_exceeded",
    });
    const container = render(() => (
      <CommunityCreationRouteView
        api={api({ getIntent: async () => blocked })}
        intentId="creation-quota"
        resolveSession={async () => ({ status: "authenticated", userId: "user-1", personas: [] })}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("You've reached the limit for new communities."));
    expect(container.querySelector<HTMLButtonElement>("button[type='submit']")?.disabled).toBe(true);
  });

  test("explains an unsupported palm-scan gate and leaves Create retryable", async () => {
    const blocked = createIntent({
      intentId: "creation-gate",
      nextAction: { kind: "blocked", reason: "gate_unsupported" },
      revision: 2,
      status: "gate_unsupported",
    });
    const container = render(() => (
      <CommunityCreationRouteView
        api={api({ getIntent: async () => blocked })}
        intentId="creation-gate"
        resolveSession={async () => ({ status: "authenticated", userId: "user-1", personas: [] })}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Palm scan isn't available right now. Try again later."));
    expect(container.querySelector<HTMLButtonElement>("button[type='submit']")?.disabled).toBe(false);
  });

  test("explains an ended setup when its update comes back terminal", async () => {
    const saved = createIntent({
      intentId: "creation-ended",
      nextAction: { kind: "commit" },
      revision: 2,
      status: "commit_ready",
    });
    const ended = createIntent({
      ...saved,
      nextAction: { kind: "none", reason: "expired" },
      revision: 3,
      status: "expired",
    });
    const updateIntent = vi.fn().mockResolvedValue(ended);
    const commitIntent = vi.fn();
    const container = render(() => (
      <CommunityCreationRouteView
        api={api({ commitIntent, getIntent: async () => saved, updateIntent })}
        intentId="creation-ended"
        navigate={() => {}}
        resolveSession={async () => ({ status: "authenticated", userId: "user-1", personas: [] })}
      />
    ));

    const name = container.querySelector<HTMLInputElement>("input")!;
    await vi.waitFor(() => expect(name.value).toBe("Saved community"));
    name.value = "Edited community";
    name.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const submit = container.querySelector<HTMLButtonElement>("button[type='submit']")!;
    await vi.waitFor(() => expect(submit.disabled).toBe(false));
    submit.click();

    await vi.waitFor(() => expect(container.textContent).toContain("This community setup has ended. Start again."));
    expect(updateIntent).toHaveBeenCalledOnce();
    expect(commitIntent).not.toHaveBeenCalled();
  });
});


describe("Named owner setup", () => {
  const owner = { status: "authenticated" as const, userId: "owner-account", personas: [{ personaId: "already-bound", displayName: "Old profile", avatarRef: null, primaryPublicHandle: null, communityBinding: { communityId: "another-community", bindingSource: "first_membership" as const } }] };
  const ready = () => createIntent({ status: "commit_ready", nextAction: { kind: "commit" } });
  const pending = () => createIntent({ status: "commit_ready", revision: 2, nextAction: { kind: "activate_profile", personaId: "fresh-owner" } });

  test("creates with an already-bound first profile and publishes only after named owner activation", async () => {
    let activated = false;
    const navigate = vi.fn();
    const confirmIdentity = vi.fn(async () => { activated = true; return true; });
    const client = api({
      createIntent: vi.fn(async () => ready()),
      getIntent: vi.fn(async () => activated ? { ...ready(), revision: 2 } : pending()),
      commitIntent: vi.fn(async () => activated ? createIntent({ status: "committed", revision: 3, nextAction: { kind: "none", reason: "committed" }, committedHref: "/communities/fresh" }) : pending()),
    });
    const container = render(() => <CommunityCreationRouteView api={client} navigate={navigate} resolveSession={async () => owner} confirmIdentity={confirmIdentity} />);
    const name = container.querySelector<HTMLInputElement>("input")!;
    name.value = "New place";
    name.dispatchEvent(new InputEvent("input", { bubbles: true }));
    fillPublicName(container);
    expect([...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Use an existing profile")?.disabled).toBe(true);
    const button = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    button.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/communities/fresh", undefined));
    expect(client.createIntent).toHaveBeenCalledWith(expect.objectContaining({ draft: expect.objectContaining({ publicName: "River Room", persona: { kind: "create_new" } }) }));
    expect(confirmIdentity).toHaveBeenCalledOnce();
    expect(client.commitIntent).toHaveBeenCalledTimes(2);
  });

  test("dismissal leaves setup private and an unrelated sign-in cannot publish it", async () => {
    const commitIntent = vi.fn();
    const confirmIdentity = vi.fn(async () => false);
    const container = render(() => <CommunityCreationRouteView api={api({ getIntent: async () => pending(), commitIntent })} intentId="creation_1" resolveSession={async () => owner} confirmIdentity={confirmIdentity} />);
    await vi.waitFor(() => expect(container.querySelector<HTMLButtonElement>("button[type=submit]")?.disabled).toBe(false));
    container.querySelector<HTMLButtonElement>("button[type=submit]")!.click();
    await vi.waitFor(() => expect(confirmIdentity).toHaveBeenCalledOnce());
    refreshSession();
    await vi.waitFor(() => expect(container.querySelector("main")?.getAttribute("data-creation-state")).toBe("ready"));
    expect(commitIntent).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Creation was not completed");
  });

  test("already activated setup commits without asking for another identity proof", async () => {
    const confirmIdentity = vi.fn();
    const commitIntent = vi.fn(async () => createIntent({ status: "committed", nextAction: { kind: "none", reason: "committed" }, committedHref: "/communities/fresh" }));
    const container = render(() => <CommunityCreationRouteView api={api({ getIntent: async () => ready(), commitIntent })} intentId="creation_1" resolveSession={async () => owner} confirmIdentity={confirmIdentity} />);
    await vi.waitFor(() => expect(container.querySelector<HTMLButtonElement>("button[type=submit]")?.disabled).toBe(false));
    container.querySelector<HTMLButtonElement>("button[type=submit]")!.click();
    await vi.waitFor(() => expect(commitIntent).toHaveBeenCalledOnce());
    expect(confirmIdentity).not.toHaveBeenCalled();
  });

  test("switching accounts during identity confirmation never publishes the saved setup", async () => {
    let account = owner;
    const commitIntent = vi.fn();
    const container = render(() => <CommunityCreationRouteView api={api({ getIntent: async () => pending(), commitIntent })} intentId="creation_1" resolveSession={async () => account} confirmIdentity={async () => { account = { ...owner, userId: "other-account" }; return true; }} />);
    await vi.waitFor(() => expect(container.querySelector<HTMLButtonElement>("button[type=submit]")?.disabled).toBe(false));
    container.querySelector<HTMLButtonElement>("button[type=submit]")!.click();
    await vi.waitFor(() => expect(container.textContent).toContain("account that saved this community"));
    expect(commitIntent).not.toHaveBeenCalled();
  });
});


describe("Stable creation lifecycle", () => {
  const owner = { status: "authenticated" as const, userId: "owner-account", personas: [] };
  const published = () => createIntent({ status: "committed", revision: 3, nextAction: { kind: "none", reason: "committed" }, committedHref: "/c/published-community" });

  test("redirects a committed intent on reload without a progress screen or mutation", async () => {
    const navigate = vi.fn();
    const client = api({ getIntent: async () => published(), commitIntent: vi.fn(), createIntent: vi.fn() });
    const container = render(() => <CommunityCreationRouteView intentId="saved" api={client} navigate={navigate} resolveSession={async () => owner} />);
    const form = container.querySelector("form");
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/c/published-community", undefined));
    expect(container.querySelector("form")).toBe(form);
    expect(container.querySelector("[data-community-creation-progress]")).toBeNull();
    expect(client.commitIntent).not.toHaveBeenCalled();
    expect(client.createIntent).not.toHaveBeenCalled();
  });

  test("follows a committed intent returned after identity confirmation without a second commit", async () => {
    let confirmed = false;
    const navigate = vi.fn();
    const client = api({ getIntent: async () => confirmed ? published() : createIntent({ nextAction: { kind: "activate_profile", personaId: "new-owner" } }), commitIntent: vi.fn() });
    const container = render(() => <CommunityCreationRouteView intentId="saved" api={client} navigate={navigate} resolveSession={async () => owner} confirmIdentity={async () => { confirmed = true; return true; }} />);
    const button = container.querySelector<HTMLButtonElement>("button[type=submit]")!;
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    button.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/c/published-community", undefined));
    expect(client.commitIntent).not.toHaveBeenCalled();
  });

  test("retains fields, labels and the button through a delayed submission and failure", async () => {
    let reject!: (error: Error) => void;
    const client = api({ createIntent: () => new Promise((_, fail) => { reject = fail; }) });
    const container = render(() => <CommunityCreationRouteView api={client} resolveSession={async () => owner} />);
    const name = container.querySelector<HTMLInputElement>("input")!;
    name.value = "A stable community";
    name.dispatchEvent(new InputEvent("input", { bubbles: true }));
    fillPublicName(container);
    const form = container.querySelector("form");
    const button = container.querySelector<HTMLButtonElement>("button[type=submit]")!;
    const labels = () => [...container.querySelectorAll("label")].map(label => label.textContent);
    const initialLabels = labels();
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    button.click();
    await vi.waitFor(() => expect(reject).toBeTypeOf("function"));
    expect(name.matches(":disabled")).toBe(true);
    expect(button.textContent?.trim()).toBe("Create");
    expect(labels()).toEqual(initialLabels);
    expect(container.querySelector("form")).toBe(form);
    reject(new Error("unavailable"));
    await vi.waitFor(() => expect(container.querySelector("[role=alert]")?.textContent).toContain("Couldn't create your community"));
    expect(name.matches(":disabled")).toBe(false);
    expect(name.value).toBe("A stable community");
    expect(button.textContent?.trim()).toBe("Create");
    expect(labels()).toEqual(initialLabels);
    expect(container.querySelector("form")).toBe(form);
  });
});


describe("Creation wait recovery", () => {
  const owner = { status: "authenticated" as const, userId: "owner-account", personas: [] };
  const waiting = () => createIntent({ nextAction: { kind: "wait", requirement: null, reasonCode: "operation_pending", retryAfterSeconds: 1 } });
  test("continues an explicitly submitted waiting intent into publication", async () => {
    const commitIntent = vi.fn(async () => createIntent({ status: "committed", revision: 3, nextAction: { kind: "none", reason: "committed" }, committedHref: "/c/ready" }));
    const navigate = vi.fn();
    const container = render(() => <CommunityCreationRouteView api={api({ createIntent: async () => waiting(), getIntent: async () => createIntent({ nextAction: { kind: "commit" }, revision: 2 }), commitIntent })} resolveSession={async () => owner} navigate={navigate} />);
    const name = container.querySelector<HTMLInputElement>("input")!;
    name.value = "Waiting community";
    name.dispatchEvent(new InputEvent("input", { bubbles: true }));
    fillPublicName(container);
    const button = container.querySelector<HTMLButtonElement>("button[type=submit]")!;
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    button.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith("/c/ready", undefined), { timeout: 3000 });
    expect(commitIntent).toHaveBeenCalledOnce();
  });

  test("makes a failed polling read retryable without creating another intent", async () => {
    const getIntent = vi.fn().mockResolvedValueOnce(waiting()).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(createIntent({ nextAction: { kind: "commit" }, revision: 2 }));
    const commitIntent = vi.fn(async () => createIntent({ status: "committed", nextAction: { kind: "none", reason: "committed" }, committedHref: "/c/ready" }));
    const createIntentRequest = vi.fn();
    const container = render(() => <CommunityCreationRouteView intentId="saved" api={api({ getIntent, commitIntent, createIntent: createIntentRequest })} resolveSession={async () => owner} navigate={() => {}} />);
    await vi.waitFor(() => expect(container.textContent).toContain("Couldn't load your community setup"), { timeout: 3000 });
    const button = container.querySelector<HTMLButtonElement>("button[type=submit]")!;
    expect(button.disabled).toBe(false);
    button.click();
    await vi.waitFor(() => expect(commitIntent).toHaveBeenCalledOnce());
    expect(createIntentRequest).not.toHaveBeenCalled();
  });
});


test("saves edited community details before retrying a saved intent without changing its reserved profile", async () => {
  const saved = createIntent({ revision: 2, nextAction: { kind: "commit" } });
  const updateIntent = vi.fn(async () => createIntent({ revision: 3, nextAction: { kind: "commit" } }));
  const commitIntent = vi.fn(async () => createIntent({ revision: 4, status: "committed", nextAction: { kind: "none", reason: "committed" }, committedHref: "/c/updated" }));
  const container = render(() => <CommunityCreationRouteView intentId="saved" api={api({ getIntent: async () => saved, updateIntent, commitIntent })} resolveSession={async () => ({ status: "authenticated", userId: "owner", personas: [] })} navigate={() => {}} />);
  const name = container.querySelector<HTMLInputElement>("input")!;
  await vi.waitFor(() => expect(name.value).toBe("Saved community"));
  expect(name.matches(":disabled")).toBe(false);
  expect(container.querySelectorAll<HTMLInputElement>("input")[1]!.matches(":disabled")).toBe(true);
  name.value = "Corrected community";
  name.dispatchEvent(new InputEvent("input", { bubbles: true }));
  refreshSession();
  await vi.waitFor(() => expect(container.querySelector("main")?.getAttribute("data-creation-state")).toBe("ready"));
  const button = container.querySelector<HTMLButtonElement>("button[type=submit]")!;
  await vi.waitFor(() => expect(button.disabled).toBe(false));
  expect(name.value).toBe("Corrected community");
  button.click();
  await vi.waitFor(() => expect(commitIntent).toHaveBeenCalledOnce());
  expect(updateIntent).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 2, draft: expect.objectContaining({ name: "Corrected community", publicName: "River Room" }) }));
  expect(commitIntent).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 3 }));
});


test("stops a stuck wait at its expiry and lets the same draft be checked again", async () => {
  const waiting = createIntent({ expiresAt: new Date(Date.now() + 250).toISOString(), nextAction: { kind: "wait", requirement: null, reasonCode: "operation_pending", retryAfterSeconds: 10 } });
  const getIntent = vi.fn().mockResolvedValueOnce(waiting).mockResolvedValue(createIntent({ nextAction: { kind: "commit" }, revision: 2 }));
  const commitIntent = vi.fn(async () => createIntent({ nextAction: { kind: "none", reason: "committed" }, committedHref: "/c/done" }));
  const container = render(() => <CommunityCreationRouteView intentId="saved" api={api({ getIntent, commitIntent })} resolveSession={async () => ({ status: "authenticated", userId: "owner", personas: [] })} navigate={() => {}} />);
  await vi.waitFor(() => expect(container.textContent).toContain("This setup expired"));
  const button = container.querySelector<HTMLButtonElement>("button[type=submit]")!;
  expect(button.disabled).toBe(false);
  button.click();
  await vi.waitFor(() => expect(commitIntent).toHaveBeenCalledOnce());
});

test("never opens an identity dialog from wait polling", async () => {
  const pending = createIntent({ revision: 2, nextAction: { kind: "activate_profile", personaId: "new" } });
  const confirmIdentity = vi.fn(async () => false);
  const container = render(() => <CommunityCreationRouteView api={api({
    createIntent: async () => createIntent({ nextAction: { kind: "wait", requirement: null, reasonCode: "operation_pending", retryAfterSeconds: 1 } }),
    getIntent: async () => pending,
  })} resolveSession={async () => ({ status: "authenticated", userId: "owner", personas: [] })} navigate={() => {}} confirmIdentity={confirmIdentity} />);
  const name = container.querySelector<HTMLInputElement>("input")!;
  name.value = "Timer community";
  name.dispatchEvent(new InputEvent("input", { bubbles: true }));
  fillPublicName(container);
  const button = container.querySelector<HTMLButtonElement>("button[type=submit]")!;
  await vi.waitFor(() => expect(button.disabled).toBe(false));
  button.click();
  await vi.waitFor(() => expect(container.textContent).toContain("Confirm it's you to finish. Select Create."), { timeout: 3000 });
  expect(confirmIdentity).not.toHaveBeenCalled();
  expect(button.disabled).toBe(false);
  button.click();
  await vi.waitFor(() => expect(confirmIdentity).toHaveBeenCalledOnce());
});
