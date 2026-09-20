import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import type { ActivePersonaPublicProjection } from "../../../api/session";
import { Type } from "@pirate/web-solid-ui";
import { CreateCommunityView } from "./create-community";
import {
  createEmptyDraft,
  withDraftDescription,
  withDraftName,
  type CreateCommunityDraft,
} from "./create-community-model";

const personaId = { kind: "create_new" } as const;

function CreateStory(props: {
  draft?: CreateCommunityDraft;
  nameError?: string | null;
  submitting?: boolean;
  steps?: boolean;
  initialStep?: 1 | 2 | 3;
  nationalityAuthoring?: boolean;
  actionOnly?: boolean;
  resuming?: boolean;
  ownerDisabled?: boolean;
  requirePersona?: boolean;
  submitLabel?: string;
  personas?: readonly ActivePersonaPublicProjection[];
}) {
  const [draft, setDraft] = createSignal<CreateCommunityDraft>(
    props.draft ?? createEmptyDraft(personaId),
  );
  const [submitCount, setSubmitCount] = createSignal(0);

  return (
    <div class="h-dvh bg-background text-foreground">
      <CreateCommunityView
        steps={props.steps}
        initialStep={props.initialStep}
        nationalityAuthoring={props.nationalityAuthoring}
        actionOnly={props.actionOnly}
        resuming={props.resuming}
        ownerDisabled={props.ownerDisabled}
        requirePersona={props.requirePersona}
        submitLabel={props.submitLabel}
        draft={draft()}
        personas={props.personas}
        nameError={props.nameError}
        onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        onSubmit={() => setSubmitCount((count) => count + 1)}
        submitting={props.submitting}
      />
      <Type aria-live="polite" class="sr-only" variant="caption">
        {`Submitted ${submitCount()} times`}
      </Type>
    </div>
  );
}

const validDraft = () =>
  withDraftDescription(
    withDraftName({ ...createEmptyDraft(personaId), publicName: "River Room" }, "Night Shift"),
    "A late-night space for music, ideas, and people building after dark.",
  );

/** Every story stages a state reachable with today's flags, or says what it waits on. */
const waitsOnPackageB = "Waits on package B (api-community-document-only-join-policy) to be reachable in the app; authoring is off in every environment today.";

const meta = {
  title: "Flows/Community/Create",
  component: CreateCommunityView,
  args: { draft: createEmptyDraft(personaId), onSubmit: () => undefined, onDraftChange: () => undefined },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof CreateCommunityView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedOut: Story = {
  name: "Signed-out visitor",
  parameters: { docs: { description: { story: "The single surface a visitor without a session gets: details, avatar and the join-policy statement stay visible, no profile section renders because no persona can exist yet, and the primary action opens in-app sign-in so a typed draft survives." } } },
  render: () => <CreateStory actionOnly requirePersona={false} steps submitLabel="Sign in to create" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Sign in to create" })).toBeEnabled();
    await expect(canvas.getByText("Who can join?")).toBeInTheDocument();
    await expect(canvas.getByText("Anyone who completes a palm scan.")).toBeInTheDocument();
    await expect(canvas.queryByRole("radio")).toBeNull();
    // No session, no persona: the profile section waits for sign-in.
    await expect(canvas.queryByRole("textbox", { name: "Public name" })).toBeNull();
  },
};

export const SavedIntent: Story = {
  name: "Saved intent",
  parameters: { docs: { description: { story: "The frozen single surface a saved creation intent reopens as: the community fields sit beside a one-line profile summary, and the action is immediate. Only a Palm-policy intent can exist today, so that is what is staged." } } },
  render: () => (
    <CreateStory
      actionOnly
      ownerDisabled
      resuming
      steps
      draft={validDraft()}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // One page carries the community fields and the locked profile summary.
    await expect(canvas.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
    await expect(canvas.queryByRole("textbox", { name: "Public name" })).toBeNull();
    await expect(canvas.getByText("Creating as River Room")).toBeInTheDocument();
    await expect(canvas.getByText("Anyone who completes a palm scan.")).toBeInTheDocument();
    await expect(canvas.queryByRole("radio")).toBeNull();
    await expect(canvas.getByRole("button", { name: "Create" })).toBeEnabled();
  },
};

export const ThreePages: Story = {
  name: "Three pages",
  render: () => <CreateStory steps nationalityAuthoring />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Continue" })).toBeDisabled();

    // The details page collects the optional community avatar, name and description.
    await expect(canvas.getByText("Choose image")).toBeInTheDocument();
    await userEvent.type(canvas.getByRole("textbox", { name: "Name" }), "Night Shift");
    await expect(canvas.getByRole("button", { name: "Continue" })).toBeEnabled();
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));

    // The join policy page offers both options and no community fields.
    await expect(await canvas.findByRole("heading", { name: "Who can join?" })).toBeInTheDocument();
    await expect(canvas.getByRole("radio", { name: "Palm scan" })).toBeChecked();
    await expect(canvas.getByRole("radio", { name: "Nationality" })).toBeInTheDocument();
    await expect(canvas.queryByRole("textbox", { name: "Name" })).toBeNull();

    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(canvas.getByText(/Each community you create or join gets its own profile/)).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "Public name" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Shuffle" })).toBeInTheDocument();

    // Back lives in the header as an arrow, like the post flow's review step.
    await userEvent.click(canvas.getByRole("button", { name: "Back to join policy" }));
    await expect(await canvas.findByRole("heading", { name: "Who can join?" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Back to community details" }));
    await expect(await canvas.findByRole("textbox", { name: "Name" })).toHaveValue("Night Shift");
  },
};

export const ValidDraft: Story = {
  render: () => <CreateStory steps draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    const create = await canvas.findByRole("button", { name: "Create" });
    await expect(create).toBeEnabled();
    await userEvent.click(create);
    await expect(canvas.getByText("Submitted 1 times")).toBeInTheDocument();
  },
};

export const NationalityPolicy: Story = {
  name: "Nationality policy",
  parameters: { docs: { description: { story: waitsOnPackageB } } },
  render: () => <CreateStory steps nationalityAuthoring draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(await canvas.findByRole("radio", { name: "Nationality" }));

    // The empty picker appears; the chips carry the meaning, no helper sentence.
    await expect(canvas.getByRole("combobox", { name: "Allowed nationalities" })).toBeInTheDocument();
    await expect(canvas.getByRole("radio", { name: "Palm scan" })).not.toBeChecked();
  },
};

export const NationalityPolicyWithChips: Story = {
  name: "Nationality policy with chips",
  parameters: { docs: { description: { story: waitsOnPackageB } } },
  render: () => <CreateStory steps nationalityAuthoring draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(await canvas.findByRole("radio", { name: "Nationality" }));

    const picker = canvas.getByRole("combobox", { name: "Allowed nationalities" });
    await userEvent.type(picker, "United States");
    await userEvent.click(await within(document.body).findByRole("option", { name: "United States" }));
    await expect(canvas.getByRole("button", { name: "Remove United States" })).toBeInTheDocument();

    await userEvent.type(picker, "Canada");
    await userEvent.click(await within(document.body).findByRole("option", { name: "Canada" }));
    await expect(canvas.getByRole("button", { name: "Remove Canada" })).toBeInTheDocument();
  },
};

export const JoinPolicyValidation: Story = {
  name: "Join policy validation",
  parameters: { docs: { description: { story: waitsOnPackageB } } },
  render: () => <CreateStory steps nationalityAuthoring draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(await canvas.findByRole("radio", { name: "Nationality" }));
    await expect(canvas.queryByText("Choose at least one country.")).not.toBeInTheDocument();

    // An empty picker blocks Continue with the note, and the profile page stays closed.
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(await canvas.findByText("Choose at least one country.")).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Who can join?" })).toBeInTheDocument();
    await expect(canvas.queryByRole("textbox", { name: "Public name" })).toBeNull();
  },
};

export const ClosedGate: Story = {
  name: "Closed authoring gate",
  parameters: { docs: { description: { story: "What production shows on page two today: with authoring off there is one policy, so the page states it in one line instead of offering a one-card choice. Becomes the two-option choice when package B lands." } } },
  render: () => <CreateStory steps draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(await canvas.findByRole("heading", { name: "Who can join?" })).toBeInTheDocument();
    await expect(canvas.getByText("Anyone who completes a palm scan.")).toBeInTheDocument();
    await expect(canvas.queryByRole("radio")).toBeNull();
    await expect(canvas.getByRole("button", { name: "Continue" })).toBeEnabled();
  },
};

export const NameValidation: Story = {
  render: () => <CreateStory steps />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByRole("textbox", { name: "Name" });
    const next = canvas.getByRole("button", { name: "Continue" });

    // Untouched and empty is neutral, not "valid" and not yet an error.
    await expect(name).not.toHaveAttribute("aria-invalid");
    await expect(canvas.queryByText("Name is required.")).not.toBeInTheDocument();

    // Focusing and leaving an empty field is enough to surface the error.
    await userEvent.click(name);
    await userEvent.tab();
    await expect(canvas.getByText("Name is required.")).toBeInTheDocument();

    await userEvent.type(name, "Signal Room");
    await expect(next).toBeEnabled();
    await userEvent.clear(name);
    await expect(next).toBeDisabled();
    await expect(canvas.getByText("Name is required.")).toBeInTheDocument();
    await expect(name).toHaveAttribute("aria-invalid", "true");
  },
};

export const EnterContinues: Story = {
  name: "Enter continues",
  render: () => <CreateStory steps draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Name" }), "{Enter}");
    await expect(await canvas.findByRole("heading", { name: "Who can join?" })).toBeInTheDocument();
  },
};

export const LongContent: Story = {
  name: "Long content",
  render: () => (
    <CreateStory
      steps
      draft={withDraftDescription(
        withDraftName(createEmptyDraft(personaId), "A deliberately long community name that should wrap gracefully across the field"),
        "A much longer description that keeps going to exercise wrapping and truncation in the field as a community is being composed.",
      )}
    />
  ),
};

export const Submitting: Story = {
  render: () => <CreateStory steps initialStep={3} draft={validDraft()} submitting />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Create" });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-busy", "true");
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <CreateStory steps nationalityAuthoring draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(await canvas.findByRole("radio", { name: "Nationality" }));
  },
};

export const Rtl: Story = {
  globals: { locale: "ar" },
  render: () => <CreateStory steps nationalityAuthoring draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "متابعة" }));
    await userEvent.click(await canvas.findByRole("radio", { name: "الجنسية" }));
    await expect(canvas.getByRole("combobox", { name: "الجنسيات المسموح بها" })).toBeInTheDocument();
  },
};

export const RejectedCommit: Story = {
  name: "Rejected commit stays retryable",
  render: () => (
    <CreateStory steps draft={validDraft()} nameError="That name is already taken." />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // A rejected commit belongs to the details page.
    await expect(await canvas.findByText("That name is already taken.")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Continue" })).toBeEnabled();
  },
};

export const ExistingProfile: Story = {
  name: "Existing profile",
  render: () => (
    <CreateStory
      steps
      initialStep={3}
      draft={validDraft()}
      personas={[{ personaId: "unused-profile", displayName: "Harbor keeper", avatarRef: null, primaryPublicHandle: null, communityBinding: null }]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("textbox", { name: "Public name" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Use an existing profile" }));
    await expect(canvas.getByText("Creating as Harbor keeper")).toBeInTheDocument();
    await expect(canvas.queryByRole("combobox")).not.toBeInTheDocument();
    await expect(canvas.getByText("This profile becomes permanently linked to this community.")).toBeInTheDocument();
  },
};

export const ProfileAvatar: Story = {
  name: "Profile avatar",
  parameters: { docs: { description: { story: "The generated profile-avatar default of Spec 014 §3.1: local, seeded, never derived from the Public name, shuffable, with upload replacing it. Persistence waits on the avatar API record." } } },
  render: () => <CreateStory steps initialStep={3} draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const image = () => canvasElement.querySelector("img");
    await expect(image()).not.toBeNull();
    const before = image()!.getAttribute("src");
    await userEvent.click(canvas.getByRole("button", { name: "Shuffle" }));
    await expect(image()!.getAttribute("src")).not.toBe(before);
  },
};
