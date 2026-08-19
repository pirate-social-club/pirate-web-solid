/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import VideoHome from "./video-home";
import { videoHomeReviewItems } from "./video-home-fixtures";

const meta = {
  title: "Compositions/Posts/VideoHome",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const ReviewFixture: Story = {
  render: () => <VideoHome items={videoHomeReviewItems} />,
};
