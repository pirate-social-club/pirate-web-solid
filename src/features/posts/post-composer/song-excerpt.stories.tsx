import type { Meta, StoryObj } from "storybook-solidjs-vite";

import {
  SongExcerptComposerSurface,
  seededExcerptDraftStore,
} from "./song-excerpt-surface";

const meta = {
  title: "Flows/Posts/VideoPost/SongExcerpt",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Choosing the song interval a song-backed video plays, on fixture data. The preview is audible: the tone is synthesized rather than bundled, so it carries no third-party rights, and its pitch steps every two seconds so moving the interval sounds different rather than merely looking different. Playback starts at the interval start and is stopped by the audio clock at its end. The songs are not real and nothing uploads, publishes or downloads. What is real is the selection: bounds are integer milliseconds, which convert exactly to the samples the server takes, and reopening the draft restores them unchanged. Three separate controls, because dragging an endpoint resizes the interval while dragging its position moves the whole span at its current length. The interval runs 3 to 180 seconds under Spec 013; the Dance segment is a separate, later, 6 to 30 second choice.",
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
