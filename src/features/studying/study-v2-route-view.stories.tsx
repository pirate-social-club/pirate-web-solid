import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import type { SessionResolution } from "../../api/session";
import type { StudyAvailability, StudySession, StudyV2Api } from "./study-v2-api";
import { StudyV2RouteView } from "./study-v2-route-view";
import { createStudySessionStartCoordinator } from "./study-session-start-coordinator.ts";

const readyAvailability: StudyAvailability = {
  available_exercise_types: ["say_it_back", "translation_choice"],
  learner_bands: ["A1", "B1"],
  learning_language: "es",
  state: "ready",
  target_languages: ["en", "ar"],
};

const processingAvailability: StudyAvailability = {
  available_exercise_types: [],
  pending_exercise_types: ["say_it_back"],
  state: "processing",
};

function learner(personaId: string, displayName: string, communityId = "community-study") {
  return {
    avatarRef: null,
    communityBinding: { bindingSource: "first_membership" as const, communityId },
    displayName,
    personaId,
    primaryPublicHandle: null,
  };
}

function authenticated(personas: ReturnType<typeof learner>[]) {
  return async () => ({ personas, status: "authenticated" as const, userId: "account-one" });
}

/** Deterministic coordinator seam: in-memory storage and a per-name lock chain. */
function storyCoordinator(api: StudyV2Api) {
  const map = new Map<string, string>();
  const chains = new Map<string, Promise<void>>();
  return createStudySessionStartCoordinator({
    api,
    storage: {
      getItem: (name) => map.get(name) ?? null,
      removeItem: (name) => { map.delete(name); },
      setItem: (name, value) => { map.set(name, value); },
    },
    locks: {
      request: async <T,>(name: string, callback: () => Promise<T>): Promise<T> => {
        const previous = chains.get(name) ?? Promise.resolve();
        let release = (): void => {};
        const gate = new Promise<void>((resolve) => { release = resolve; });
        chains.set(name, previous.then(() => gate));
        await previous;
        try {
          return await callback();
        } finally {
          release();
        }
      },
    },
    generateKey: () => "story-session-key",
    timezone: () => "UTC",
  });
}

/** The first exercise the server serves for a prepared participant. */
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
      post_id: "post-paper-moon",
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
    community_id: "community-study",
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
    persona_id: "persona-learner",
    post_id: "post-paper-moon",
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

function studyApi(options: {
  availability?: StudyAvailability;
  createSession?: StudyV2Api["createSession"];
  getSession?: StudyV2Api["getSession"];
} = {}): StudyV2Api {
  const unused = async (): Promise<never> => { throw new Error("unused by this story"); };
  return {
    createSession: options.createSession ?? (async () => routeSession()),
    deleteLearnerAudio: unused,
    getSession: options.getSession ?? (async () => routeSession()),
    loadAvailability: async () => ({
      availability: options.availability ?? readyAvailability,
      communityId: "community-study",
    }),
    requestGeneration: unused,
    submitAudio: unused,
    submitChoice: unused,
  };
}

const meta = {
  title: "Screens/Studying/StudyV2Route",
  component: StudyV2RouteView,
  args: { navigate: () => undefined, postId: "post-paper-moon" },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof StudyV2RouteView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The session read and availability read are both in flight. */
export const Loading: Story = {
  args: { resolveSession: () => new Promise<SessionResolution>(() => {}) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveAccessibleName("Loading study");
  },
};

/** A prepared participant opens the first exercise directly; no Start screen. */
export const DirectFirstExercise: Story = {
  args: {
    api: studyApi(),
    resolveSession: authenticated([learner("persona-learner", "Learner")]),
    startCoordinator: storyCoordinator(studyApi()),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Record" })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Sing line 1" })).toBeInTheDocument();
    await expect(canvas.queryByRole("heading", { name: "Start Study" })).toBeNull();
  },
};

/** Anonymous visitors get the sign-in state instead of a member read. */
export const AuthRequired: Story = {
  args: { resolveSession: async () => "anonymous" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("heading", { name: "Sign in to study" })).toBeInTheDocument());
    expect(canvas.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  },
};

/** A failed profile read keeps the retry and never claims a membership problem. */
export const ProfilesUnavailable: Story = {
  args: {
    resolveSession: async () => ({
      personas: [],
      personasUnavailable: true as const,
      status: "authenticated" as const,
      userId: "account-one",
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText("We couldn't load your community profiles. Retry before starting Study.")).toBeInTheDocument(),
    );
    expect(canvas.getByRole("button", { name: "Try Again" })).toBeInTheDocument();
  },
};

/** An account without a persona in this community prepares one instead of joining. */
export const PersonaPreparation: Story = {
  name: "Persona preparation",
  args: {
    api: studyApi(),
    resolveSession: authenticated([learner("persona-elsewhere", "Elsewhere", "community-other")]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByRole("heading", { name: "Set up Study" })).toBeInTheDocument(),
    );
    expect(canvas.queryByText("Join this community or create a persona there before starting Study.")).not.toBeInTheDocument();
  },
};

/** Availability still being generated is reported as a delay, not a failure. */
export const CardsProcessing: Story = {
  args: {
    api: studyApi({ availability: processingAvailability }),
    resolveSession: authenticated([learner("persona-learner", "Learner")]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText("This song's Study cards are still being prepared. Try again shortly.")).toBeInTheDocument(),
    );
  },
};

/** Two eligible personas have no default, so Start stays disabled until one is picked. */
export const PersonaSelection: Story = {
  name: "Persona selection",
  args: {
    api: studyApi(),
    resolveSession: authenticated([
      learner("persona-first", "First"),
      learner("persona-second", "Second"),
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("heading", { name: "Start Study" })).toBeInTheDocument());
    expect(canvas.getByRole("button", { name: "Start" })).toBeDisabled();
  },
};

/** Choosing a helper language reveals the learner-level select. */
export const HelperLanguage: Story = {
  args: {
    api: studyApi(),
    resolveSession: authenticated([
      learner("persona-first", "First"),
      learner("persona-second", "Second"),
    ]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByLabelText("Helper language")).toBeInTheDocument());
    await userEvent.selectOptions(canvas.getByLabelText("Helper language"), "en");
    await waitFor(() => expect(canvas.getByLabelText("Learner level")).toBeInTheDocument());
  },
};

/** The direct start is in flight; the surface says what it is doing. */
export const SessionLoading: Story = {
  name: "Session loading",
  args: {
    api: studyApi({ createSession: () => new Promise<StudySession>(() => {}) }),
    resolveSession: authenticated([learner("persona-learner", "Learner")]),
    startCoordinator: storyCoordinator(studyApi({ createSession: () => new Promise<StudySession>(() => {}) })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("status")).toHaveAccessibleName("Starting study");
  },
};

/** A failed start leaves an honest message and the explicit configuration. */
export const SessionError: Story = {
  name: "Session error",
  args: {
    api: studyApi({ createSession: async () => { throw new Error("session start failed"); } }),
    resolveSession: authenticated([learner("persona-learner", "Learner")]),
    startCoordinator: storyCoordinator(studyApi({ createSession: async () => { throw new Error("session start failed"); } })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText(/could not (confirm|start) this session/i)).toBeInTheDocument(),
    );
    await expect(canvas.queryByRole("button", { name: "Record" })).toBeNull();
  },
};
