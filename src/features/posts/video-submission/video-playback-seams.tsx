import { createContext, useContext } from "solid-js";
import type { attachPlayback } from "./playback-engine";
import type { mintPlaybackAccess } from "./playback-access";

/**
 * Review seam for players mounted deep inside shared cards, where a story
 * cannot pass player props. Production never provides it, so every player
 * mints through the access endpoint and reads the cookie-authorized poster.
 */
export interface VideoPlaybackSeams {
  readonly mint?: typeof mintPlaybackAccess;
  readonly attach?: typeof attachPlayback;
  readonly posterPath?: (postId: string) => string;
}

export const VideoPlaybackSeamsContext = createContext<VideoPlaybackSeams>({});

export function useVideoPlaybackSeams(): VideoPlaybackSeams {
  return useContext(VideoPlaybackSeamsContext);
}
