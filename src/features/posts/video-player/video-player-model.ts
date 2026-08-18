export interface VideoPlayerState {
  canPlay: boolean;
  hasPoster: boolean;
  startAtSeconds: number;
  looping: boolean;
}

export function getVideoPlayerState(options: {
  src?: string;
  poster?: string;
  currentTime?: number;
  loop?: boolean;
}): VideoPlayerState {
  return {
    canPlay: Boolean(options.src?.trim()),
    hasPoster: Boolean(options.poster?.trim()),
    startAtSeconds: Number.isFinite(options.currentTime) && (options.currentTime ?? 0) >= 0 ? options.currentTime ?? 0 : 0,
    looping: options.loop === true,
  };
}
