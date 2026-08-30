import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { CommunityCreationApi } from "./community-creation-api";
import { CommunityCreationRouteView } from "./community-creation-route-view";
import { createIntent } from "./community-creation-progress/community-creation-progress-model";
import { GlobalSignInHost } from "../auth/global-sign-in-host";

const disposers: Array<() => void> = [];

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
  test("requires a signed-in session", async () => {
    const container = render(() => <>
      <GlobalSignInHost reload={() => {}} />
      <CommunityCreationRouteView api={api()} resolveSession={async () => "anonymous"} />
    </>);

    await vi.waitFor(() => expect(container.textContent).toContain("Sign in to create a community"));
    expect(container.querySelector("[data-create-community]")).toBeNull();
    const signIn = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.trim() === "Sign in")!;
    signIn.click();
    await vi.waitFor(() => expect(document.body.querySelector("[aria-label='Join Pirate']")).not.toBeNull());
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

    await vi.waitFor(() => expect(container.textContent).toContain("Create community"));
    const commitButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Create community");
    commitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await vi.waitFor(() => expect(container.textContent).toContain("This creation changed"));
    expect(commitIntent).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 1 }));
    expect(getIntent).toHaveBeenCalledTimes(2);
  });
});
