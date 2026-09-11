import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import type { SessionResolution } from "../../api/session";
import type { StudyAvailability, StudySession, StudyV2Api } from "./study-v2-api";
import { StudyV2RouteView } from "./study-v2-route-view";

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

function studyApi(options: {
  availability?: StudyAvailability;
  onStart?: (input: Parameters<StudyV2Api["createSession"]>[0]) => void;
} = {}): StudyV2Api {
  const unused = async (): Promise<never> => { throw new Error("unused by this story"); };
  return {
    createSession: async (input) => {
      options.onStart?.(input);
      return new Promise<StudySession>(() => {});
    },
    deleteLearnerAudio: unused,
    getSession: unused,
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

/** A persona bound to another community cannot start a session here. */
export const NoCommunityPersona: Story = {
  args: {
    api: studyApi(),
    resolveSession: authenticated([learner("persona-elsewhere", "Elsewhere", "community-other")]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText("Join this community or create a persona there before starting Study.")).toBeInTheDocument(),
    );
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

/** Speaking practice needs no helper language and no level. */
export const Configure: Story = {
  args: {
    api: studyApi(),
    resolveSession: authenticated([learner("persona-learner", "Learner")]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("heading", { name: "Start Study" })).toBeInTheDocument());
    expect(canvas.getByRole("button", { name: "Start" })).toBeEnabled();
  },
};

/** Two eligible personas have no default, so Start stays disabled until one is picked. */
export const PersonaChoiceRequired: Story = {
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
    resolveSession: authenticated([learner("persona-learner", "Learner")]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByLabelText("Helper language")).toBeInTheDocument());
    await userEvent.selectOptions(canvas.getByLabelText("Helper language"), "en");
    await waitFor(() => expect(canvas.getByLabelText("Learner level")).toBeInTheDocument());
  },
};

/** Starting a session passes the chosen persona and no invented language or level. */
const startedSessions: Parameters<StudyV2Api["createSession"]>[0][] = [];
export const StartSession: Story = {
  args: {
    api: studyApi({ onStart: (input) => { startedSessions.length = 0; startedSessions.push(input); } }),
    resolveSession: authenticated([learner("persona-learner", "Learner")]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Start" })).toBeEnabled());
    await userEvent.click(canvas.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(startedSessions).toHaveLength(1));
    expect(startedSessions[0]).toMatchObject({
      communityId: "community-study",
      learnerBand: null,
      personaId: "persona-learner",
      postId: "post-paper-moon",
      targetLanguage: null,
    });
  },
};

/** A failed session start leaves the configuration in place with an honest message. */
export const StartFailed: Story = {
  args: {
    api: studyApi({ onStart: () => { throw new Error("session start failed"); } }),
    resolveSession: authenticated([learner("persona-learner", "Learner")]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Start" })).toBeEnabled());
    await userEvent.click(canvas.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(canvas.getByText("Could not start this Study session. Try again.")).toBeInTheDocument());
  },
};

export const Mobile: Story = {
  args: {
    api: studyApi(),
    resolveSession: authenticated([learner("persona-learner", "Learner")]),
  },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
