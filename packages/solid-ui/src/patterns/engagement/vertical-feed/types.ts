/**
 * Shared types for the VerticalFeed engagement pattern.
 * Plain data only: no product, routing, or commerce concepts.
 */

/**
 * Haptic hint kinds a host app may map to device vibration. The pattern only
 * reports the kind; whether and how to vibrate is the host's decision.
 */
export type HapticKind = "light" | "double";

/** One item in a vertical media feed. */
export interface MediaPostData {
  id: string;
  /** Playable video URL. Omit (with posterUrl) for a poster-only post. */
  videoUrl?: string;
  /** Poster image shown until playback starts. */
  posterUrl?: string;
  /** Display handle of the post author (rendered as @authorName). */
  authorName: string;
  authorAvatarUrl?: string;
  /** Caption text shown under the author name. */
  caption?: string;
  /** Title of the attached soundtrack or media. */
  title?: string;
  /** Artist or creator of the attached soundtrack or media. */
  artist?: string;
  /** Cover image of the attached soundtrack or media. */
  mediaImageUrl?: string;
  likeCount: number;
  isLiked?: boolean;
  isFollowing?: boolean;
}

/**
 * Attaches a host-owned source (e.g. signed adaptive streaming) to the
 * design-system video element and returns its cleanup. Lets a host keep the
 * feed layout while owning delivery; the pattern never fetches by itself.
 */
export type VideoSourceAttacher = (video: HTMLVideoElement) => () => void;

export interface VideoPlayerProps {
  videoUrl?: string;
  /** Host-attached source, used instead of videoUrl. Attached while eager. */
  attachVideo?: VideoSourceAttacher;
  posterUrl?: string;
  isPlaying: boolean;
  isMuted: boolean;
  /** Eager loading for the active and adjacent posts. */
  priorityLoad?: boolean;
  class?: string;
  onTogglePlay: () => void;
  /** Called when the browser blocks playback (autoplay policy). */
  onPlayFailed?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

/**
 * An activity a host offers for a post, shown in the action rail with a
 * label under its icon (e.g. practising or singing the post's soundtrack).
 * Plain data: the host decides availability and handles the selection.
 */
export interface MediaActivityAction {
  readonly id: string;
  readonly label: string;
  readonly icon: "speech" | "microphone";
}

export interface MediaActionsProps {
  authorName: string;
  authorAvatarUrl?: string;
  isFollowing?: boolean;
  isLiked: boolean;
  likeCount?: number;
  isMuted: boolean;
  title?: string;
  artist?: string;
  mediaImageUrl?: string;
  class?: string;
  onAuthorClick?: () => void;
  onFollowClick?: () => void;
  onLikeClick?: () => void;
  onShareClick?: () => void;
  onSoundtrackClick?: () => void;
  /** Host-offered activities, shown above the soundtrack button. */
  activities?: readonly MediaActivityAction[];
  onActivityClick?: (activityId: string) => void;
  onToggleMute?: () => void;
  onHaptic?: (kind: HapticKind) => void;
}
