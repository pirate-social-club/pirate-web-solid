/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { PublicFeed } from "./public-feed";
import { publicFeedReviewPage } from "./public-feed-fixtures";
import { MediaShell } from "../../shell/media-shell/media-shell";

const meta = { title: "Compositions/Posts/PublicFeed", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const ReviewFixture: Story = {
  render: () => <MediaShell><PublicFeed data={publicFeedReviewPage} /></MediaShell>,
};
