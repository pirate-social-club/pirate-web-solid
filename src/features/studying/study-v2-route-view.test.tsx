import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

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
});
