import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import type { SongSubmissionView } from "../media-submission/projection";
import { PostedSong } from "./posted-song.tsx";
import type { SongSubmissionItem } from "./song-submission-store";

const item = (view: SongSubmissionView, extra: Partial<SongSubmissionItem> = {}): SongSubmissionItem => ({
  submissionId: "song-1",
  accountId: "account-1",
  communityId: "community-1",
  title: "Midnight Waves",
  authorHandle: "Harbor",
  view,
  slow: false,
  rerunning: false,
  ...extra,
});

const processing = item({ status: "processing", submissionId: "song-1", phase: "analysis" });
const published = item({ status: "published", submissionId: "song-1", postId: "song-post-1", postHref: "/posts/song-post-1" });
const failed = item({ status: "processing_failed", submissionId: "song-1", reasonCode: "analysis_failed", retryable: true });
const review = item({ status: "manual_review", submissionId: "song-1", reasonCode: "review_required", reviewRef: "review-1" });

const meta = {
  title: "Flows/Posts/Song after Post",
  component: PostedSong,
  args: {
    item: processing,
    onClose: fn(),
    onCheck: fn(),
    onRetry: fn(),
    onDismiss: fn(),
  },
  parameters: {
    layout: "fullscreen",
    a11y: { test: "error" },
    docs: { description: { component: "Paper ruling 14 (Flows/Posts/Song 137-140): after Post the author sees one vertically centred state on the same page, not a card in the feed. Closing it while the song is still processing returns to the feed, where the pending card carries the song." } },
  },
  render: args => <div class="px-4 md:p-8"><PostedSong {...args} /></div>,
} satisfies Meta<typeof PostedSong>;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { globals: { viewport: { value: "mobile1", isRotated: false } } } as const;

/** The state's icon and text sit in the vertical middle of the screen. */
async function expectCentred(canvasElement: HTMLElement, heading: string) {
  const view = canvasElement.ownerDocument.defaultView!;
  const title = await within(canvasElement).findByRole("heading", { name: heading });
  const box = title.getBoundingClientRect();
  await expect(Math.abs((box.top + box.bottom) / 2 - view.innerHeight / 2)).toBeLessThanOrEqual(view.innerHeight * 0.15);
  await expect(Math.abs((box.left + box.right) / 2 - view.innerWidth / 2)).toBeLessThanOrEqual(2);
}

/** Paper 137: processing, with no button; the author may leave. */
export const ProcessingMobile: Story = {
  ...phone,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expectCentred(canvasElement, "Processing your song");
    await expect(canvas.getByText("You can leave this page.")).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Song" })).toBeVisible();
    await expect(canvas.getAllByRole("button")).toHaveLength(1);
    await expect(canvas.getByRole("button", { name: "Close song status" })).toBeVisible();
  },
};

/** Paper 138: published, with the song's title and View song in the footer. */
export const PublishedMobile: Story = {
  ...phone,
  args: { item: published },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expectCentred(canvasElement, "Published");
    await expect(canvas.getByText("Midnight Waves")).toBeVisible();
    const view = canvas.getByRole("link", { name: "View song" });
    await expect(view).toHaveAttribute("href", "/posts/song-post-1");
    const footer = view.closest("footer")!;
    await expect(Math.round(view.getBoundingClientRect().width)).toBe(Math.round(footer.getBoundingClientRect().width) - 32);
  },
};

/** Paper 139: processing failed; Try again runs it again. */
export const FailedMobile: Story = {
  ...phone,
  args: { item: failed },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expectCentred(canvasElement, "Couldn't process this song");
    await expect(canvas.getByText("Nothing was published.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(args.onRetry).toHaveBeenCalledWith("song-1");
  },
};

/** Paper 140: waiting for a moderator, with no button. */
export const WaitingForReviewMobile: Story = {
  ...phone,
  args: { item: review },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expectCentred(canvasElement, "Waiting for review");
    await expect(canvas.getByText("A moderator will check this song.")).toBeVisible();
    await expect(canvas.getAllByRole("button")).toHaveLength(1);
  },
};

/** Slow reads: the processing state says so and offers Check now. */
export const ProcessingSlowMobile: Story = {
  ...phone,
  args: { item: item(processing.view, { slow: true }) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Checking on this song is taking longer than usual. Still trying.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Check now" }));
    await expect(args.onCheck).toHaveBeenCalledWith("song-1");
  },
};

/** Desktop: the same states in the main column's card, close and "Song" at the top left. */
export const PublishedDesktop: Story = {
  args: { item: published },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const close = canvas.getByRole("button", { name: "Close song status" });
    const heading = canvas.getByRole("heading", { name: "Song" });
    await expect(close.getBoundingClientRect().right).toBeLessThanOrEqual(heading.getBoundingClientRect().left);
    await expect(canvas.getByRole("heading", { name: "Published" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "View song" })).toBeVisible();
    await userEvent.click(close);
    await expect(args.onClose).toHaveBeenCalled();
  },
};
