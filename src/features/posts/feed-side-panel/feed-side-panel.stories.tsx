import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, screen, userEvent, within } from "storybook/test";

import { Button, Type } from "../../../design-system";
import { FeedPanelLayout, FeedSidePanel } from "./feed-side-panel";

function Comments() {
  return (
    <div class="flex flex-col gap-3 p-4">
      {Array.from({ length: 8 }, (_, index) => (
        <Type as="p" variant="body">
          Comment {index + 1} on this post.
        </Type>
      ))}
    </div>
  );
}

function Feed() {
  return (
    <div class="flex flex-col gap-4 p-4">
      {Array.from({ length: 6 }, (_, index) => (
        <div class="rounded-[var(--radius-lg)] border border-border-soft p-4">
          <Type as="p" variant="body-strong">Post {index + 1}</Type>
        </div>
      ))}
    </div>
  );
}

/**
 * The panel docks beside the feed above the xl breakpoint and becomes a bottom
 * sheet below it, so the host owns the open state in both arrangements.
 */
function PanelStory(props: { initialOpen?: boolean }) {
  const [open, setOpen] = createSignal(props.initialOpen ?? true);

  return (
    <div class="min-h-dvh bg-background text-foreground">
      <FeedPanelLayout
        panel={
          <FeedSidePanel
            closeLabel="Close comments"
            description="12 comments"
            onOpenChange={setOpen}
            open={open()}
            title="Comments"
          >
            <Comments />
          </FeedSidePanel>
        }
      >
        <div class="flex flex-col gap-3">
          <div class="p-4">
            <Button onClick={() => setOpen(true)}>Open comments</Button>
          </div>
          <Feed />
        </div>
      </FeedPanelLayout>
    </div>
  );
}

const meta = {
  title: "Parts/Posts/FeedSidePanel",
  component: FeedSidePanel,
  args: {
    children: <Comments />,
    closeLabel: "Close comments",
    onOpenChange: () => undefined,
    open: true,
    title: "Comments",
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  render: () => <PanelStory />,
} satisfies Meta<typeof FeedSidePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  name: "Open",
  play: async () => {
    await expect(await screen.findByText("Comment 1 on this post.")).toBeInTheDocument();
  },
};

export const Closed: Story = {
  name: "Closed",
  render: () => <PanelStory initialOpen={false} />,
};

/** Opening from the feed is the path a reader actually takes. */
export const OpensFromFeed: Story = {
  name: "Opens from the feed",
  render: () => <PanelStory initialOpen={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open comments" }));
    await expect(await screen.findByText("Comment 1 on this post.")).toBeInTheDocument();
  },
};

/** Below xl the same panel is a bottom sheet rather than a dock. */
export const Mobile: Story = {
  name: "Mobile sheet",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const LayoutWithoutPanel: Story = {
  name: "Layout with no panel",
  render: () => (
    <div class="min-h-dvh bg-background text-foreground">
      <FeedPanelLayout>
        <Feed />
      </FeedPanelLayout>
    </div>
  ),
};
