import { requestGlobalSignIn } from "../../auth/global-sign-in-host.tsx";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import { Type } from "../../../design-system.ts";
import { CommunityPostCard } from "../../community/page-shell/page-shell.tsx";
import { CommentCard } from "./comment-card.tsx";
import { EngagementControls } from "./engagement-controls.tsx";

const meta = {
  title: "Parts/Posts/Shared engagement",
  parameters: { layout: "padded", a11y: { test: "error" }, docs: { description: { component: "Shared presentation with explicit callback fixtures. Live controllers retain requests, durable retries and permissions. No comment voting endpoint exists; no comment votes are fabricated." } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function PostFixture() {
  const [score, setScore] = createSignal(3);
  const [vote, setVote] = createSignal<"up" | "down" | null>(null);
  const [reported, setReported] = createSignal(0);
  const [comments, setComments] = createSignal(false);
  return <div class="mx-auto max-w-3xl"><CommunityPostCard
    post={{ id: "shared-story-post", title: "Harbor Lights", body: "A new song for our next listening session.", kind: "text", score: score(), commentCount: 2, authorHandle: "owned.pirate", publishedAt: "2026-10-05T08:00:00Z" }}
    actions={<EngagementControls score={score()} viewerVote={vote()} commentCount={2} onComment={() => setComments(true)} onVote={next => {
      const value = (direction: "up" | "down" | null) => direction === "up" ? 1 : direction === "down" ? -1 : 0;
      setScore(score() - value(vote()) + value(next)); setVote(next);
    }} />}
    menuActions={[{ label: "Report", run: () => setReported(count => count + 1) }]} />
    {reported() > 0 && <><Type role="status">Report callback received</Type><output aria-label="Report calls">{reported()}</output></>}
    {comments() && <Type role="status">Comments callback received</Type>}
  </div>;
}
function CommentFixture(props: { actions?: boolean; locked?: boolean } = {}) {
  const [reported, setReported] = createSignal(0);
  return <div class="mx-auto max-w-3xl"><CommentCard item={{ id: "shared-comment", submissionId: null, parentId: null, body: "The chorus is a good place to start practising.", authorLabel: props.locked ? undefined : "owned.pirate", authorAvatarRef: "/storybook/karaoke-artwork.svg", createdAt: "2026-10-05T08:00:00Z", depth: 0, replyCount: 0, state: props.locked ? "age_locked" : "published", caseRef: null, href: null }}
    communityLabel={props.locked ? undefined : "Night Shift"}
    postContext={props.locked ? undefined : { title: "On Open Water", href: "/posts/on-open-water" }}
    menuActions={props.actions ? [{ label: "Report", run: () => setReported(count => count + 1) }] : undefined} />
    {reported() > 0 && <><Type role="status">Report callback received</Type><output aria-label="Report calls">{reported()}</output></>}
  </div>;
}
export const InteractivePost: Story = {
  render: PostFixture,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Upvote" }));
    await expect(canvas.getByRole("button", { name: "Upvote" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Downvote" }));
    await expect(canvas.getByRole("button", { name: "Downvote" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: "Downvote" }));
    await expect(canvas.getByRole("button", { name: "Downvote" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(canvas.getByRole("button", { name: "Comments (2)" }));
    await expect(canvas.getByText("Comments callback received")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Post options" }));
    await userEvent.click(within(canvasElement.ownerDocument.body).getByRole("menuitem", { name: "Report" }));
    await expect(canvas.getByText("Report callback received")).toBeVisible();
    await expect(canvas.getByLabelText("Report calls")).toHaveTextContent("1");
    await userEvent.click(canvas.getByRole("button", { name: "Post options" }));
    within(canvasElement.ownerDocument.body).getByRole("menuitem", { name: "Report" }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(canvas.getByLabelText("Report calls")).toHaveTextContent("2");
  },
};
export const ReadOnlyPost: Story = {
  render: () => <div class="mx-auto max-w-3xl"><CommunityPostCard post={{ id: "readonly", title: "Harbor Lights", body: "Public post", score: 3, commentCount: 2, publishedAt: "2026-10-05T08:00:00Z" }} actions={<EngagementControls score={3} commentCount={2} onVote={requestGlobalSignIn} onComment={requestGlobalSignIn} />} /></div>,
  name: "Signed-out post",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    let prompts = 0;
    const prompted = () => { prompts += 1; };
    const window = canvasElement.ownerDocument.defaultView!;
    window.addEventListener("pirate:connect", prompted);
    try {
      await expect(canvas.queryByRole("button", { name: "Post options" })).not.toBeInTheDocument();
      await userEvent.click(canvas.getByRole("button", { name: "Upvote" }));
      await userEvent.click(canvas.getByRole("button", { name: "Downvote" }));
      await userEvent.click(canvas.getByRole("button", { name: "Comments (2)" }));
      await expect(prompts).toBe(3);
    } finally {
      window.removeEventListener("pirate:connect", prompted);
    }
  },
};
export const PublicComment: Story = {
  render: () => <CommentFixture />,
  play: async ({ canvasElement }) => { const canvas = within(canvasElement); await expect(canvas.queryByRole("button", { name: "Comment options" })).not.toBeInTheDocument(); await expect(canvas.queryByRole("button", { name: "Upvote" })).not.toBeInTheDocument(); await expect(canvas.getByRole("link", { name: "On Open Water" })).toBeVisible(); },
};
export const ReportableComment: Story = {
  render: () => <CommentFixture actions />,
  play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByRole("button", { name: "Comment options" })); await userEvent.click(within(canvasElement.ownerDocument.body).getByRole("menuitem", { name: "Report" })); await expect(canvas.getByText("Report callback received")).toBeVisible(); },
};
export const AgeLocked: Story = { render: () => <CommentFixture locked />, play: async ({ canvasElement }) => { const canvas = within(canvasElement); await expect(canvas.queryByText("The chorus is a good place to start practising.")).not.toBeInTheDocument(); await expect(canvas.queryByRole("link")).not.toBeInTheDocument(); } };
export const Mobile: Story = { ...InteractivePost, globals: { viewport: { value: "mobile1", isRotated: false } } };

export const CountsWithoutViewer: Story = {
  render: () => <CommunityPostCard post={{ id: "no-viewer", title: "Public post", body: "The caller has not supplied viewer actions.", score: 3, commentCount: 2, publishedAt: new Date().toISOString() }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button", { name: "Upvote" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Post options" })).not.toBeInTheDocument();
    await expect(canvas.getByText(/Just now/u)).toBeVisible();
  },
};
