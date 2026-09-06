import { createSignal, onCleanup } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Type } from "@pirate/web-solid-ui";
import { CreateCommunityView } from "./create-community";
import {
  createEmptyDraft,
  withDraftDescription,
  withDraftName,
  type CreateCommunityDraft,
} from "./create-community-model";

const personaId = { kind: "existing", personaId: "persona_1" } as const;

function CreateStory(props: {
  draft?: CreateCommunityDraft;
  nameError?: string | null;
  submitting?: boolean;
}) {
  const [draft, setDraft] = createSignal<CreateCommunityDraft>(
    props.draft ?? createEmptyDraft(personaId),
  );
  const [submitCount, setSubmitCount] = createSignal(0);
  const [avatarSrc, setAvatarSrc] = createSignal<string | null>(null);
  const [coverSrc, setCoverSrc] = createSignal<string | null>(null);
  let avatarObjectUrl: string | null = null;
  let coverObjectUrl: string | null = null;

  const updatePreview = (kind: "avatar" | "cover", file: File | null) => {
    const current = kind === "avatar" ? avatarObjectUrl : coverObjectUrl;
    if (current) URL.revokeObjectURL(current);
    const next = file ? URL.createObjectURL(file) : null;
    if (kind === "avatar") {
      avatarObjectUrl = next;
      setAvatarSrc(next);
    } else {
      coverObjectUrl = next;
      setCoverSrc(next);
    }
  };

  onCleanup(() => {
    if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
    if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
  });

  return (
    <div class="h-dvh bg-background text-foreground">
      <CreateCommunityView
        avatarSrc={avatarSrc()}
        coverSrc={coverSrc()}
        draft={draft()}
        onAvatarChange={(file) => updatePreview("avatar", file)}
        onCoverChange={(file) => updatePreview("cover", file)}
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
    withDraftName(createEmptyDraft(personaId), "Night Shift"),
    "A late-night space for music, ideas, and people building after dark.",
  );

const meta = {
  title: "Flows/Community/Create",
  component: CreateCommunityView,
  args: { draft: createEmptyDraft(personaId), onSubmit: () => undefined, onDraftChange: () => undefined },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof CreateCommunityView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  render: () => <CreateStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Create" })).toBeDisabled();
    await expect(canvas.getByText("Who can join")).toBeInTheDocument();
    await expect(canvas.getByText("Palm scan")).toBeInTheDocument();
    await expect(canvas.getByText(/Required · Members scan their palm/)).toBeInTheDocument();
    await expect(canvas.queryByText("Additional requirements")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("checkbox")).not.toBeInTheDocument();
  },
};

export const ValidDraft: Story = {
  render: () => <CreateStory draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Create" })).toBeEnabled();
    await expect(canvas.getByText("Palm scan")).toBeInTheDocument();
  },
};

export const NameValidation: Story = {
  render: () => <CreateStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByRole("textbox", { name: "Name" });

    // Untouched and empty is neutral, not "valid" and not yet an error.
    await expect(name).not.toHaveAttribute("aria-invalid");
    await expect(canvas.queryByText("Name is required.")).not.toBeInTheDocument();

    // Focusing and leaving an empty field is enough to surface the error.
    await userEvent.click(name);
    await userEvent.tab();
    await expect(canvas.getByText("Name is required.")).toBeInTheDocument();

    await userEvent.type(name, "Signal Room");
    await expect(canvas.getByRole("button", { name: "Create" })).toBeEnabled();
    await userEvent.clear(name);
    await expect(canvas.getByRole("button", { name: "Create" })).toBeDisabled();
    await expect(canvas.getByText("Name is required.")).toBeInTheDocument();
    await expect(name).toHaveAttribute("aria-invalid", "true");
  },
};

export const EnterSubmits: Story = {
  render: () => <CreateStory draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Name" }), "{Enter}");
    await expect(canvas.getByText(/Submitted 1 times/)).toBeInTheDocument();
  },
};

export const LongContent: Story = {
  render: () => (
    <CreateStory
      draft={withDraftDescription(
        withDraftName(createEmptyDraft(personaId), "A deliberately long community name that should wrap gracefully across the field"),
        "A much longer description that keeps going to exercise wrapping and truncation in the field as a community is being composed.",
      )}
    />
  ),
};

export const Submitting: Story = {
  render: () => <CreateStory draft={validDraft()} submitting />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Create" });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-busy", "true");
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <CreateStory draft={validDraft()} />,
};

export const Rtl: Story = {
  globals: { locale: "ar" },
  render: () => <CreateStory draft={validDraft()} />,
};

export const RejectedCommit: Story = {
  name: "Rejected commit stays retryable",
  render: () => (
    <CreateStory draft={validDraft()} nameError="That name is already taken." />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText("That name is already taken.")).toBeInTheDocument();

    const submit = canvas.getByRole("button", { name: "Create" });
    await expect(submit).toBeEnabled();
    await userEvent.click(submit);
  },
};
