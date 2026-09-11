import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import type { SessionResolution } from "../../api/session";
import { CommunityCreationRouteView } from "./community-creation-route-view";
import { createIntent as createIntentView } from "./community-creation-progress/community-creation-progress-model";

const persona = {
  personaId: "persona-harbor",
  displayName: "Harbor Keeper",
  avatarRef: null,
  primaryPublicHandle: "harborkeeper.pirate",
  communityBinding: null,
};

const authenticated = (): SessionResolution => ({
  status: "authenticated",
  userId: "account-one",
  personas: [persona],
});

const quotaIntent = createIntentView({
  intentId: "creation-quota",
  nextAction: { kind: "blocked", reason: "quota_exceeded" },
  revision: 3,
  status: "quota_exceeded",
});

const stateOf = (container: HTMLElement) =>
  container.querySelector("main[data-creation-state]")?.getAttribute("data-creation-state");

const meta = {
  title: "Screens/Community/CommunityCreationRoute",
  component: CommunityCreationRouteView,
  args: { navigate: () => undefined },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof CommunityCreationRouteView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `/communities/new` while the account session is still resolving. */
export const Resolving: Story = {
  args: { resolveSession: () => new Promise<SessionResolution>(() => {}) },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(stateOf(canvasElement)).toBe("resolving"));
  },
};

/** Signed out: the form offers creation with a new profile rather than blocking. */
export const SignedOut: Story = {
  args: { resolveSession: async () => "anonymous" },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(stateOf(canvasElement)).toBe("signed-out"));
  },
};

/** Signed in with profiles: choosing the existing profile names it in the form. */
export const Ready: Story = {
  args: { resolveSession: async () => authenticated() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(stateOf(canvasElement)).toBe("ready"));
    await userEvent.click(canvas.getByRole("button", { name: "Use an existing profile" }));
    await waitFor(() => expect(canvas.getByText("Creating as Harbor Keeper")).toBeInTheDocument());
  },
};

/** A failed profile read keeps the form usable and offers a profiles retry. */
export const ProfilesUnavailable: Story = {
  args: {
    resolveSession: async () => ({
      status: "authenticated" as const,
      userId: "account-one",
      personas: [],
      personasUnavailable: true,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText("Could not load your existing profiles. You can still create a new profile.")).toBeInTheDocument(),
    );
    await expect(canvas.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  },
};

/** A failed account check preserves the draft and offers an account retry. */
export const Unavailable: Story = {
  args: {
    resolveSession: async () => {
      throw new Error("account check failed");
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(stateOf(canvasElement)).toBe("unavailable"));
    await expect(canvas.getByText("Could not check your account. Your setup is still here.")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  },
};

/** A quota-blocked saved intent keeps the reason visible and Create disabled. */
export const QuotaExceeded: Story = {
  args: {
    api: {
      commitIntent: async () => quotaIntent,
      createIntent: async () => quotaIntent,
      getIntent: async () => quotaIntent,
      updateIntent: async () => quotaIntent,
    },
    intentId: "creation-quota",
    resolveSession: async () => authenticated(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText("You've reached the limit for new communities.")).toBeInTheDocument(),
    );
    await expect(canvas.getByRole("button", { name: "Create" })).toBeDisabled();
  },
};

export const Mobile: Story = {
  args: { resolveSession: async () => authenticated() },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
