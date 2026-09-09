import type { Meta, StoryObj } from "storybook-solidjs-vite";

import {
  SongExcerptComposerSurface,
  seededExcerptDraftStore,
} from "./song-excerpt-surface";

const meta = {
  title: "Flows/Posts/VideoPost/SongExcerpt",
  parameters: {
    layout: "fullscreen",
    globals: { viewport: { value: "mobile1", isRotated: false } },
    docs: {
      description: {
        component:
          "Choosing the song excerpt a video is danced to, on fixture data. The songs are not real, no audio plays, and nothing uploads, publishes or downloads. What is real is the selection: bounds are integer milliseconds, the same values publication and the standalone MP3 would use, and reopening the draft restores them unchanged. Three separate controls, because dragging an endpoint resizes the excerpt while dragging its position moves the whole span at its current length — moving the start must never drag the end along with it. The excerpt runs six to thirty seconds, per specification 021.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The whole slice: choose, adjust, preview, retain, reopen. */
export const ChooseAndRetain: Story = {
  render: () => <SongExcerptComposerSurface />,
};

/** Opens with an excerpt already retained, so reopening the draft can be
 * exercised without first selecting one. */
export const RestoredFromDraft: Story = {
  render: () => (
    <SongExcerptComposerSurface store={seededExcerptDraftStore("fixture-song-cadence", 87_300, 104_900)} />
  ),
};

/** A song barely longer than the minimum excerpt, where the controls have
 * almost no room to move. */
export const ShortSong: Story = {
  render: () => (
    <SongExcerptComposerSurface store={seededExcerptDraftStore("fixture-song-interlude", 0, 8_200)} />
  ),
};
