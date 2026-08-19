/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { communityThreadReviewPage } from "./community-thread-fixtures.ts";
import { CommunityThreadView } from "./community-thread-view.tsx";

const meta = {
  title: "Compositions/Community/Thread/ThreadView",
  component: CommunityThreadView,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof CommunityThreadView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReviewFixture: Story = {
  args: { thread: communityThreadReviewPage },
};

export const CommentsUnavailable: Story = {
  args: { thread: { ...communityThreadReviewPage, comments: [], commentsStatus: "unavailable" } },
};
