import { createSignal, onCleanup, Show } from "solid-js";
import { Button, Type } from "../../../design-system";
import { type ExcerptBounds, formatExcerptTime } from "../post-composer/song-excerpt";

/** The audio half of a local composed preview. Injected so a test can drive
 * the clock without a decoder, exactly as the guide playback is injected. */
export interface PreviewAudio {
  currentTime: number;
  readonly paused?: boolean;
  play: () => Promise<void>;
  pause: () => void;
}

/** A local preview of the video with the intended soundtrack.
 *
 * It plays the captured video (its own audio muted, because the song replaces
 * it) against the granted song audio started at the excerpt. This is a
 * convenience, not proof of the published result: the server renders the final
 * master from the canonical song samples, and the two can differ by a frame.
 * The label says so rather than implying this is the final video.
 */
export function SongReviewPreview(props: {
  readonly videoUrl?: string;
  readonly posterUrl?: string;
  readonly audioUrl: string;
  readonly bounds: ExcerptBounds;
  readonly createAudio?: (url: string) => PreviewAudio;
}) {
  const [playing, setPlaying] = createSignal(false);
  const [issue, setIssue] = createSignal<string>();
  let video: HTMLVideoElement | undefined;
  let audio: PreviewAudio | undefined;
  let frame: number | undefined;

  const stopWatching = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
  };
  const stop = () => {
    stopWatching();
    video?.pause();
    audio?.pause();
    setPlaying(false);
  };
  onCleanup(stop);

  const watch = () => {
    frame = requestAnimationFrame(() => {
      frame = undefined;
      if (!playing() || !audio) return;
      if (audio.currentTime * 1_000 >= props.bounds.endMs) {
        stop();
        return;
      }
      if (video && video.ended) {
        stop();
        setIssue("This clip ends before the excerpt does, so the preview stopped early.");
        return;
      }
      watch();
    });
  };

  const toggle = async () => {
    const element = video;
    if (!element) return;
    if (playing()) {
      stop();
      return;
    }
    setIssue(undefined);
    audio = props.createAudio ? props.createAudio(props.audioUrl) : new Audio(props.audioUrl);
    audio.currentTime = props.bounds.startMs / 1_000;
    element.currentTime = 0;
    setPlaying(true);
    try {
      await Promise.all([element.play(), audio.play()]);
      watch();
    } catch {
      stop();
      setIssue("This preview could not start. Check your sound settings and try again.");
    }
  };

  return (
    <div class="grid gap-2">
      <video
        class="h-full w-full object-contain"
        muted
        playsinline
        poster={props.posterUrl}
        ref={element => { video = element; }}
        src={props.videoUrl}
      />
      <Button disabled={!props.videoUrl} onClick={() => void toggle()} type="button" variant="secondary">
        {playing() ? "Pause preview" : "Play with the song"}
      </Button>
      <Type as="p" variant="caption" role="status">
        Local preview with the intended soundtrack, {formatExcerptTime(props.bounds.startMs)} to{" "}
        {formatExcerptTime(props.bounds.endMs)}. The published video is rendered by the server from this excerpt;
        this preview is not the final master.
      </Type>
      <Show when={issue()}>
        {(message) => <Type as="p" variant="caption" role="alert">{message()}</Type>}
      </Show>
    </div>
  );
}
