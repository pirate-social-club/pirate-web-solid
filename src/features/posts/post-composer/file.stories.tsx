import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { Type } from "../../../design-system";
import { PostComposer } from "./post-composer";
import { baseComposer } from "./story-fixtures";
import { ComposerFrame } from "./story-helpers";

const meta = {
  title: "App/Posts/PostComposer/File",
  component: PostComposer,
  args: baseComposer,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PostComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

function fileFixture(): File | null {
  return typeof File === "undefined"
    ? null
    : new File(["id,name\n1,one\n"], "export.csv", { type: "text/csv" });
}

function FileComposerFlow(props: { initialStatus?: string }) {
  const [status, setStatus] = createSignal(props.initialStatus ?? "Ready to publish");
  const file = fileFixture();
  return (
    <ComposerFrame narrow>
      <PostComposer
        {...baseComposer}
        mode="file"
        availableTabs={["file"]}
        titleValue="Research export"
        textBodyValue="A deterministic downloadable file."
        file={{ upload: file, label: file?.name ?? "export.csv" }}
        submit={{
          canPost: true,
          label: "Publish locked file",
          onSubmit: () => setStatus("Publication queued"),
        }}
      />
      <Type as="p" variant="caption" class="sr-only" aria-live="polite">{status()}</Type>
    </ComposerFrame>
  );
}

export const Flow: Story = {
  name: "File publication flow",
  render: () => <FileComposerFlow />,
};

export const Mobile: Story = {
  ...Flow,
  name: "Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const Processing: Story = {
  name: "Processing — scanner pending",
  render: () => <FileComposerFlow initialStatus="Processing file" />,
};

export const Retrying: Story = {
  name: "Retrying — registration",
  render: () => <FileComposerFlow initialStatus="Retrying publication" />,
};

export const ResumableFailure: Story = {
  name: "Failure — resumable publication",
  render: () => <FileComposerFlow initialStatus="Publication can be retried" />,
};

export const Published: Story = {
  name: "Terminal — published navigation",
  render: () => <FileComposerFlow initialStatus="Published — navigating to the post" />,
};
