import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import type { SessionResolution } from "../../api/session";
import type { CommunityCreationApi } from "./community-creation-api";
import { CommunityCreationRouteView } from "./community-creation-route-view";
import { createIntentView } from "./community-creation-intent/community-creation-intent-fixtures";

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

const avatarCandidateIntent = createIntentView({
  avatarOutcomes: { community: "attached", persona: "attached" },
  nextAction: { kind: "blocked", reason: "gate_unsupported" },
  status: "gate_unsupported",
});

const successfulAvatarUpload = fn(async (input: Parameters<NonNullable<CommunityCreationApi["uploadAvatar"]>>[0]) =>
  input.purpose === "community"
    ? "avatar-11111111-1111-4111-8111-111111111111"
    : "avatar-22222222-2222-4222-8222-222222222222",
);
const successfulAvatarCreate = fn(async (_input: Parameters<CommunityCreationApi["createIntent"]>[0]) => avatarCandidateIntent);
const omittedAvatarUpload = fn(async (_input: Parameters<NonNullable<CommunityCreationApi["uploadAvatar"]>>[0]) => {
  throw new Error("optional upload unavailable");
});
const omittedAvatarCreate = fn(async (_input: Parameters<CommunityCreationApi["createIntent"]>[0]) => avatarCandidateIntent);

function avatarStoryApi(
  uploadAvatar: NonNullable<CommunityCreationApi["uploadAvatar"]>,
  createIntent: CommunityCreationApi["createIntent"],
): CommunityCreationApi {
  return {
    uploadAvatar,
    createIntent,
    getIntent: async () => avatarCandidateIntent,
    updateIntent: async () => avatarCandidateIntent,
    commitIntent: async () => avatarCandidateIntent,
  };
}

async function completeAvatarStory(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  await waitFor(() => expect(stateOf(canvasElement)).toBe("ready"));
  await userEvent.upload(
    canvasElement.querySelector<HTMLInputElement>('input[type="file"]')!,
    new File([new Uint8Array([1, 2, 3])], "community.png", { type: "image/png" }),
  );
  await userEvent.type(canvas.getByRole("textbox", { name: "Name" }), "Avatar harbor");
  await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
  await userEvent.click(await canvas.findByRole("button", { name: "Create" }));
  await waitFor(() => expect(canvas.getByText("This community requirement is not available right now. Your setup is still here.")).toBeInTheDocument());
}

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

export const AvatarAttachmentCandidate: Story = {
  name: "Avatar attachment candidate",
  args: {
    api: avatarStoryApi(successfulAvatarUpload, successfulAvatarCreate),
    avatarAuthoring: true,
    resolveSession: async () => ({ status: "authenticated", userId: "account-one", personas: [] }),
  },
  play: async ({ canvasElement }) => {
    successfulAvatarUpload.mockClear();
    successfulAvatarCreate.mockClear();
    await completeAvatarStory(canvasElement);
    await expect(successfulAvatarUpload).toHaveBeenCalledTimes(2);
    await expect(successfulAvatarCreate).toHaveBeenCalledWith(expect.objectContaining({
      draft: expect.objectContaining({
        communityAvatarRef: "avatar-11111111-1111-4111-8111-111111111111",
        personaAvatarRef: "avatar-22222222-2222-4222-8222-222222222222",
      }),
    }));
  },
};

export const AvatarUploadOmitted: Story = {
  name: "Avatar upload omitted",
  args: {
    api: avatarStoryApi(omittedAvatarUpload, omittedAvatarCreate),
    avatarAuthoring: true,
    resolveSession: async () => ({ status: "authenticated", userId: "account-one", personas: [] }),
  },
  play: async ({ canvasElement }) => {
    omittedAvatarUpload.mockClear();
    omittedAvatarCreate.mockClear();
    await completeAvatarStory(canvasElement);
    await expect(omittedAvatarUpload).toHaveBeenCalledTimes(2);
    const submitted = omittedAvatarCreate.mock.calls[0]?.[0].draft;
    await expect(submitted.communityAvatarRef).toBeUndefined();
    await expect(submitted.personaAvatarRef).toBeUndefined();
  },
};
