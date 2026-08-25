import { createSignal, onCleanup } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Type } from "@pirate/web-solid-ui";
import {
  CreateCommunityView,
} from "./create-community";
import {
  createEmptyDraft,
  withDraftDescription,
  withDraftGates,
  withDraftName,
  type CreateCommunityDraft,
} from "./create-community-model";

const personaId = "persona_1";

function CreateStory(props: { draft?: CreateCommunityDraft; submitting?: boolean }) {
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
    <div class="min-h-[720px] bg-background p-6 text-foreground">
      <CreateCommunityView
        avatarSrc={avatarSrc()}
        coverSrc={coverSrc()}
        draft={draft()}
        onAvatarChange={(file) => updatePreview("avatar", file)}
        onCoverChange={(file) => updatePreview("cover", file)}
        onDraftChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        onGatesChange={(kinds) => setDraft((current) => withDraftGates(current, kinds))}
        onSubmit={() => setSubmitCount((count) => count + 1)}
        submitting={props.submitting}
      />
      <Type aria-live="polite" class="sr-only" variant="caption">Submitted {submitCount()} times</Type>
    </div>
  );
}

const validDraft = () =>
  withDraftDescription(
    withDraftName(createEmptyDraft(personaId), "Signal Room"),
    "A room for live signals and quiet listening.",
  );

const meta = {
  title: "Compositions/Community/CreateCommunity",
  component: CreateCommunityView,
  args: { draft: createEmptyDraft(personaId), onSubmit: () => undefined, onDraftChange: () => undefined, onGatesChange: () => undefined },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof CreateCommunityView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  render: () => <CreateStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Create" })).toBeDisabled();
    await expect(canvas.getByText("Palm scan")).toBeInTheDocument();
    await expect(canvas.queryByText("Creating as")).not.toBeInTheDocument();
  },
};

export const ValidDraft: Story = {
  render: () => <CreateStory draft={validDraft()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Create" })).toBeEnabled();
  },
};

export const NameValidation: Story = {
  render: () => <CreateStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = canvas.getByRole("textbox", { name: "Name" });
    await userEvent.type(name, "Signal Room");
    await expect(canvas.getByRole("button", { name: "Create" })).toBeEnabled();
    await userEvent.clear(name);
    await expect(canvas.getByRole("button", { name: "Create" })).toBeDisabled();
    await expect(canvas.getByText("Name is required.")).toBeInTheDocument();
  },
};

export const GatePicker: Story = {
  render: () => <CreateStory draft={withDraftName(createEmptyDraft(personaId), "Signal Room")} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add gate" }));
    await expect(canvas.queryByRole("checkbox", { name: "Palm scan" })).not.toBeInTheDocument();
    await expect(canvas.getByText("Palm scan")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("checkbox", { name: "Age minimum (18+)" }));
    await expect(canvas.getByRole("checkbox", { name: "Age minimum (18+)" })).toBeChecked();
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
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => <CreateStory draft={validDraft()} />,
};
