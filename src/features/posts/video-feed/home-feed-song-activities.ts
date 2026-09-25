import type { MediaActivityAction } from "@pirate/web-solid-ui";

import type { SongAttributionLinkResolver } from "../song-attribution/song-attribution.ts";

/** A rail activity plus the song page it opens. */
export interface HomeSongActivity extends MediaActivityAction {
  readonly href: string;
}

/**
 * The activities a feed video's song offers right now. Study appears only
 * when Study reports ready for this viewer; Karaoke only when the song's
 * lyrics are aligned. Any failed read shows nothing rather than a dead
 * button.
 */
export async function resolveSongActivities(
  songPostId: string,
  scope: string,
  deps: {
    readonly resolveLink: SongAttributionLinkResolver;
    readonly studyReady: (songPostId: string, scope: string) => Promise<boolean>;
  },
): Promise<readonly HomeSongActivity[]> {
  const [link, study] = await Promise.all([
    deps.resolveLink({ songPostId }).catch(() => null),
    deps.studyReady(songPostId, scope).catch(() => false),
  ]);
  const paths = link?.activityPaths;
  if (!paths) return [];
  const activities: HomeSongActivity[] = [];
  if (study) activities.push({ id: "study", label: "Study", icon: "speech", href: paths.study });
  if (link.karaokeReady) activities.push({ id: "karaoke", label: "Karaoke", icon: "microphone", href: paths.karaoke });
  return activities;
}
