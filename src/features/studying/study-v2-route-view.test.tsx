import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import { refreshSession, type SessionResolution } from "../../api/session";
import type { StudySession, StudyV2Api } from "./study-v2-api";
import { StudyV2RouteView } from "./study-v2-route-view";

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

function studyApi(createSession = vi.fn(() => new Promise<StudySession>(() => {}))): StudyV2Api {
  const unused = async (): Promise<never> => { throw new Error("unused"); };
  return {
    createSession,
    deleteLearnerAudio: unused,
    getSession: unused,
    loadAvailability: async () => ({
      availability: {
        available_exercise_types: ["say_it_back", "translation_choice"],
        learner_bands: ["A1", "B1"],
        learning_language: "es",
        state: "ready",
        target_languages: ["en", "ar"],
      },
      communityId: "community-1",
    }),
    requestGeneration: unused,
    submitAudio: unused,
    submitChoice: unused,
  };
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
  document.head.replaceChildren();
});

describe("Study v2 production route", () => {
  test("unavailable profiles offer retry instead of a false membership claim", async () => {
    let unavailable = true;
    const api = studyApi();
    const availability = vi.spyOn(api, "loadAvailability");
    const container = render(() => <StudyV2RouteView api={api} postId="post-1"
      resolveSession={async () => ({ status: "authenticated", userId: "user-1",
        personas: unavailable ? [] : [{ personaId: "here", displayName: "Here", avatarRef: null, primaryPublicHandle: null,
          communityBinding: { communityId: "community-1", bindingSource: "first_membership" } }],
        personasUnavailable: unavailable ? true as const : undefined })} />);
    await vi.waitFor(() => expect(container.textContent).toContain("couldn't load your community profiles"));
    expect(container.textContent).not.toContain("Join this community");
    expect(availability).not.toHaveBeenCalled();
    unavailable = false;
    [...container.querySelectorAll("button")].find(button => button.textContent?.trim() === "Try Again")!.click();
    await vi.waitFor(() => expect(container.textContent).toContain("Speaking practice only"));
    expect(api.createSession).not.toHaveBeenCalled();
  });

  test("several community-bound personas have no default", async () => {
    const createSession = vi.fn(() => new Promise<StudySession>(() => {}));
    const container = render(() => <StudyV2RouteView api={studyApi(createSession)} postId="post-1"
      resolveSession={async () => ({ status: "authenticated", userId: "user-1", personas:
        ["first", "second"].map(personaId => ({
          personaId, displayName: personaId, avatarRef: null, primaryPublicHandle: null,
          communityBinding: { communityId: "community-1", bindingSource: "first_membership" as const },
        })),
      })}
    />);
    await vi.waitFor(() => expect(container.textContent).toContain("Speaking practice only"));
    const start = [...container.querySelectorAll("button")].find(button => button.textContent?.trim() === "Start")!;
    expect(start.disabled).toBe(true);
    start.click();
    expect(createSession).not.toHaveBeenCalled();
  });

  test("an elsewhere binding cannot be selected for Study", async () => {
    const createSession = vi.fn(() => new Promise<StudySession>(() => {}));
    const container = render(() => <StudyV2RouteView api={studyApi(createSession)} postId="post-1"
      resolveSession={async () => ({ status: "authenticated", userId: "user-1", personas: [{
        personaId: "elsewhere", displayName: "Elsewhere", avatarRef: null, primaryPublicHandle: null,
        communityBinding: { communityId: "community-other", bindingSource: "first_membership" as const },
      }] })}
    />);
    await vi.waitFor(() => expect(container.textContent).toContain("Join this community"));
    expect(createSession).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Create a new persona");
  });

  test("does not load member Study availability for an anonymous session", async () => {
    const api = studyApi();
    const loadAvailability = vi.spyOn(api, "loadAvailability");
    const container = render(() => (
      <StudyV2RouteView api={api} postId="post-1" resolveSession={async () => "anonymous"} />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Sign in to study"));
    expect(loadAvailability).not.toHaveBeenCalled();
  });

  test("starts speaking practice without inventing a helper language or level", async () => {
    const createSession = vi.fn(() => new Promise<StudySession>(() => {}));
    const container = render(() => (
      <StudyV2RouteView
        api={studyApi(createSession)}
        postId="post-1"
        resolveSession={async () => ({
          personas: [{
            avatarRef: null,
            displayName: "Learner",
            personaId: "persona-1",
            primaryPublicHandle: "learner",
            communityBinding: { communityId: "community-1", bindingSource: "first_membership" },
          }],
          status: "authenticated",
          userId: "user-1",
        })}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Speaking practice only"));
    const start = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Start");
    start?.click();

    await vi.waitFor(() => expect(createSession).toHaveBeenCalledTimes(1));
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      communityId: "community-1",
      learnerBand: null,
      personaId: "persona-1",
      postId: "post-1",
      targetLanguage: null,
    }));
  });

  const learnerSession: SessionResolution = {
    status: "authenticated",
    userId: "user-1",
    personas: [{
      avatarRef: null,
      displayName: "Learner",
      personaId: "persona-1",
      primaryPublicHandle: "learner",
      communityBinding: { communityId: "community-1", bindingSource: "first_membership" },
    }],
  };

  test("resumes an anonymous route once when sign-in refreshes the session", async () => {
    let authenticated = false;
    const api = studyApi();
    const loadAvailability = vi.spyOn(api, "loadAvailability");
    const container = render(() => (
      <StudyV2RouteView
        api={api}
        postId="post-1"
        resolveSession={async () => authenticated ? learnerSession : "anonymous"}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Sign in to study"));
    expect(loadAvailability).not.toHaveBeenCalled();
    authenticated = true;
    refreshSession();
    await vi.waitFor(() => expect(container.textContent).toContain("Speaking practice only"));
    expect(loadAvailability).toHaveBeenCalledOnce();
  });

  test("coalesces two synchronous refreshes into one continuation request", async () => {
    let authenticated = false;
    const requests: Array<(session: SessionResolution) => void> = [];
    const api = studyApi();
    const loadAvailability = vi.spyOn(api, "loadAvailability");
    const resolveContinuation = vi.fn(() => new Promise<SessionResolution>(resolve => { requests.push(resolve); }));
    const container = render(() => (
      <StudyV2RouteView
        api={api}
        postId="post-1"
        resolveSession={() => authenticated ? resolveContinuation() : Promise.resolve("anonymous")}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Sign in to study"));
    authenticated = true;
    refreshSession();
    refreshSession();
    await vi.waitFor(() => expect(resolveContinuation).toHaveBeenCalledOnce());
    expect(requests).toHaveLength(1);
    requests[0]!(learnerSession);
    await vi.waitFor(() => expect(container.textContent).toContain("Speaking practice only"));
    expect(loadAvailability).toHaveBeenCalledOnce();
  });

  test("rejects a stale retry response that resolves after a newer request", async () => {
    const requests: Array<(session: SessionResolution) => void> = [];
    const api = studyApi();
    const loadAvailability = vi.spyOn(api, "loadAvailability");
    const unavailableSession: SessionResolution = {
      status: "authenticated",
      userId: "user-1",
      personas: [],
      personasUnavailable: true,
    };
    let calls = 0;
    const container = render(() => (
      <StudyV2RouteView
        api={api}
        postId="post-1"
        resolveSession={() => {
          calls += 1;
          if (calls === 1) return Promise.resolve(unavailableSession);
          return new Promise<SessionResolution>(resolve => { requests.push(resolve); });
        }}
      />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Try Again"));
    const retry = [...container.querySelectorAll("button")].find(button => button.textContent?.trim() === "Try Again")!;
    retry.click();
    retry.click();
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[1]!(learnerSession);
    await vi.waitFor(() => expect(container.textContent).toContain("Speaking practice only"));
    requests[0]!("anonymous");
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(container.textContent).toContain("Speaking practice only");
    expect(container.textContent).not.toContain("Sign in to study");
    expect(loadAvailability).toHaveBeenCalledOnce();
  });

  test("does not restart a configured session on an unrelated refresh", async () => {
    const api = studyApi();
    const loadAvailability = vi.spyOn(api, "loadAvailability");
    const container = render(() => (
      <StudyV2RouteView api={api} postId="post-1" resolveSession={async () => learnerSession} />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Speaking practice only"));
    expect(loadAvailability).toHaveBeenCalledOnce();
    refreshSession();
    await Promise.resolve();
    expect(loadAvailability).toHaveBeenCalledOnce();
  });

  test("unsubscribes from session refresh when the route unmounts", async () => {
    const api = studyApi();
    const loadAvailability = vi.spyOn(api, "loadAvailability");
    const container = render(() => (
      <StudyV2RouteView api={api} postId="post-1" resolveSession={async () => "anonymous"} />
    ));

    await vi.waitFor(() => expect(container.textContent).toContain("Sign in to study"));
    for (const dispose of disposers.splice(0)) dispose();
    refreshSession();
    await Promise.resolve();
    expect(loadAvailability).not.toHaveBeenCalled();
  });
});
