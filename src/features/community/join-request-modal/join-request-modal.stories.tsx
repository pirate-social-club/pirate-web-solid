import { Show, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Type } from "@pirate/web-solid-ui";
import {
  CommunityJoinRequestModal,
  type CommunityJoinRequestModalProps,
} from "./community-join-request-modal";

function JoinRequestStory(props: Pick<CommunityJoinRequestModalProps, "initialNote" | "submitted" | "submitting">) {
  const [open, setOpen] = createSignal(true);
  const [submitted, setSubmitted] = createSignal(props.submitted ?? false);
  const [lastNote, setLastNote] = createSignal("");
  const [submitCount, setSubmitCount] = createSignal(0);
  let opener: HTMLButtonElement | undefined;

  const handleSubmit = (note: string) => {
    if (props.submitting) return;
    setLastNote(note);
    setSubmitCount((count) => count + 1);
    setSubmitted(true);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setSubmitted(false);
    setOpen(nextOpen);
    if (!nextOpen) {
      const focusOpenerAfterClose = () => {
        if (document.querySelector('[role="dialog"]')) {
          requestAnimationFrame(focusOpenerAfterClose);
          return;
        }
        opener?.focus();
      };
      queueMicrotask(focusOpenerAfterClose);
    }
  };

  const reopen = () => {
    setSubmitted(false);
    setOpen(true);
    queueMicrotask(() => opener?.focus());
  };

  return (
    <div class="min-h-[680px] bg-background p-6 text-foreground" dir="rtl">
      <Show when={!open()}>
        <button ref={(element) => { opener = element; }} id="join-request-reopen" onClick={reopen} type="button">Reopen request</button>
      </Show>
      <CommunityJoinRequestModal
        communityName="Signal Room"
        initialNote={props.initialNote}
        onOpenChange={handleOpenChange}
        onSubmit={handleSubmit}
        open={open()}
        submitted={submitted()}
        submitting={props.submitting}
      />
      <Show when={lastNote()}>
        {(note) => <Type aria-live="polite" class="sr-only" variant="caption">Submitted note: {note()} ({note().length} characters); submitted {submitCount()} times</Type>}
      </Show>
    </div>
  );
}

const meta = {
  title: "Parts/Community/JoinRequestModal",
  component: CommunityJoinRequestModal,
  args: { communityName: "Signal Room", onOpenChange: () => undefined, onSubmit: () => undefined, open: true },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof CommunityJoinRequestModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Default",
  globals: { direction: "rtl" },
  render: () => <JoinRequestStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await within(document.body).findByRole("dialog");
    const note = within(dialog).getByRole("textbox", { name: "Message (Optional)" });
    await expect(dialog).toHaveAttribute("dir", "rtl");
    await expect(note).toHaveAttribute("dir", "auto");
    await waitFor(() => expect(document.activeElement).toBe(note), { timeout: 5000 });
    await userEvent.type(note, "  I would like to contribute to Signal Room.  ");
    await expect(within(dialog).getByText("46/500")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Submit" }));
    await expect(within(document.body).getByRole("heading", { name: "Request submitted" })).toBeInTheDocument();
    await userEvent.click(within(document.body).getByRole("button", { name: "Done" }));
    await expect(within(document.body).queryByRole("dialog")).toBeNull();
    await waitFor(
      () => expect(document.activeElement).toBe(canvas.getByRole("button", { name: "Reopen request" })),
      { timeout: 5000 },
    );
  },
};

export const WithPrefilledNote: Story = {
  name: "With prefilled note",
  globals: { direction: "rtl" },
  render: () => <JoinRequestStory initialNote="I have been following the community and would like to participate." />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).getByRole("textbox", { name: "Message (Optional)" })).toHaveValue("I have been following the community and would like to participate.");
  },
};

export const Submitting: Story = {
  name: "Submitting",
  globals: { direction: "rtl" },
  render: () => <JoinRequestStory submitting />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    const note = within(dialog).getByRole("textbox", { name: "Message (Optional)" });
    const submit = within(dialog).getByRole("button", { name: "Submit" });
    await expect(note).toBeDisabled();
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute("aria-busy", "true");
  },
};

export const Submitted: Story = {
  name: "Submitted",
  globals: { direction: "rtl" },
  render: () => <JoinRequestStory submitted />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).getByRole("heading", { name: "Request submitted" })).toBeInTheDocument();
  },
};
