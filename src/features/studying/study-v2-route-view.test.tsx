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

function studyApi(
  createSession = vi.fn(() => new Promise<StudySession>(() => {})),
  getSession: StudyV2Api["getSession"] = async () => {
    throw new Error("unused");
  },
): StudyV2Api {
  const unused = async (): Promise<never> => { throw new Error("unused"); };
  return {
    createSession,
    deleteLearnerAudio: unused,
    getSession,
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


function routeSession(): StudySession {
  const items: StudySession["items"] = [1, 2, 3, 4].map((index) => ({
    answer_visibility: "always_visible",
    exercise_review_key: `review-${index}`,
    exercise_type: "say_it_back",
    exercise_variant: "spoken-v1",
    exercise_version_id: `version-${index}`,
    feedback_policy_revision: "feedback-v1",
    feedback_release: "every_graded_attempt",
    grader_policy_revision: "script_aware_token_phonetic_v3",
    language_profile_revision: null,
    languages: { learning_language: "en", target_language: null },
    learner_band: null,
    line: {
      audio_revision: 1,
      line_source_hash: `hash-${index}`,
      line_version: 1,
      lyric_line_id: `line-${index}`,
      lyrics_revision: 1,
      post_id: "post-1",
      study_unit_id: `unit-${index}`,
    },
    maximum_attempts: 3,
    object: "study_session_item_v2",
    ordinal: index - 1,
    presentation: {
      capture: "microphone_audio",
      kind: "say_it_back",
      reference_text: `Sing line ${index}`,
    },
    quality_policy_revision: "quality-v1",
    session_item_id: `item-${index}`,
  }));
  return {
    audio_revision: 1,
    community_id: "community-1",
    completed_at: null,
    created_at: "2026-09-12T10:00:00Z",
    items,
    language_profile_revision: null,
    languages: { learning_language: "en", target_language: null },
    learner_band: null,
    lesson: {
      completion_reason: null,
      current: {
        is_reappearance: false,
        presentation_number: 1,
        presented_at: "2026-09-12T10:00:00Z",
        session_item_id: "item-1",
      },
      presentation_cap: 12,
      presentation_count: 1,
      resolved_card_count: 0,
      total_card_count: 4,
    },
    lyrics_revision: 1,
    object: "study_session_v2",
    persona_id: "persona-1",
    post_id: "post-1",
    progress: {
      answered_exercise_count: 0,
      first_pass_correct: 0,
      qualifying_exercise_count: 4,
      required_correct: 3,
      score_bps: null,
    },
    qualification_policy_revision: "qualification-v1",
    selection_policy_revision: "selection-v1",
    session_id: "session-1",
    source_set_revision: 1,
    status: "active",
    study_profile_revision: 1,
    timezone: "UTC",
  };
}

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

  const enterLesson = async (container: HTMLElement, createSession: ReturnType<typeof vi.fn>) => {
    await vi.waitFor(() => expect(container.textContent).toContain("Start"));
    const start = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Start");
    start?.click();
    await vi.waitFor(() => expect(createSession).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(container.textContent).toContain("Record"));
    return [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Record");
  };

  test("shows the required first-use microphone disclosure before the first capture", async () => {
    localStorage.clear();
    const recorderStart = vi.fn(async () => {});
    const recorder = { start: recorderStart, stop: vi.fn(), cancel: vi.fn() };
    const session = routeSession();
    const createSession = vi.fn(async () => session);
    const container = render(() => (
      <StudyV2RouteView
        api={studyApi(createSession, async () => session)}
        postId="post-1"
        recorder={recorder}
        resolveSession={async () => learnerSession}
      />
    ));

    const record = await enterLesson(container, createSession);
    record?.click();
    await vi.waitFor(() =>
      expect(container.querySelector("[data-study-mic-disclosure]")).toBeTruthy(),
    );
    expect(container.textContent).toContain("ElevenLabs");
    expect(container.textContent).toContain("24 months");
    expect(recorderStart).not.toHaveBeenCalled();

    const cancel = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Cancel");
    cancel?.click();
    await vi.waitFor(() =>
      expect(container.querySelector("[data-study-mic-disclosure]")).toBeNull(),
    );
    expect(recorderStart).not.toHaveBeenCalled();

    const recordAgain = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Record");
    recordAgain?.click();
    await vi.waitFor(() =>
      expect(container.querySelector("[data-study-mic-disclosure]")).toBeTruthy(),
    );
    const accept = container.querySelector<HTMLElement>("[data-study-mic-disclosure-accept]");
    expect(accept).toBeTruthy();
    accept?.click();
    await vi.waitFor(() => expect(recorderStart).toHaveBeenCalledOnce());
    expect(localStorage.getItem("study:microphone-disclosure:v1")).toBe("1");
  });

  test("starts capture without the disclosure once it is acknowledged", async () => {
    localStorage.setItem("study:microphone-disclosure:v1", "1");
    const recorderStart = vi.fn(async () => {});
    const recorder = { start: recorderStart, stop: vi.fn(), cancel: vi.fn() };
    const session = routeSession();
    const createSession = vi.fn(async () => session);
    const container = render(() => (
      <StudyV2RouteView
        api={studyApi(createSession, async () => session)}
        postId="post-1"
        recorder={recorder}
        resolveSession={async () => learnerSession}
      />
    ));

    const record = await enterLesson(container, createSession);
    record?.click();
    await vi.waitFor(() => expect(recorderStart).toHaveBeenCalledOnce());
    expect(container.querySelector("[data-study-mic-disclosure]")).toBeNull();
  });
});
