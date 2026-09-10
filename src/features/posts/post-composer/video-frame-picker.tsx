// Video cover-frame picker for the video details step, ported from the React
// post-composer-content.tsx (VideoFramePicker). The React console.debug
// logging was dropped.

import { createEffect, createSignal, Show } from "solid-js";

import { Input, Type } from "../../../design-system";
import type { ComposerCopy } from "./copy";

function formatTimestamp(seconds: number): string {
  const bounded = Math.max(0, seconds);
  const mins = Math.floor(bounded / 60);
  const secs = bounded % 60;
  return `${mins}:${secs.toFixed(1).padStart(4, "0")}`;
}

export function VideoFramePicker(props: {
  copy: ComposerCopy;
  file: File;
  frameSeconds: string;
  onFrameSecondsChange: (value: string) => void;
}) {
  let videoRef: HTMLVideoElement | undefined;
  const [objectUrl, setObjectUrl] = createSignal<string | null>(null);
  const [durationSeconds, setDurationSeconds] = createSignal(0);
  const selectedSeconds = () => Math.min(
    durationSeconds() || 0,
    Math.max(0, Number.parseFloat(props.frameSeconds || "0") || 0),
  );

  createEffect(
    () => props.file,
    (file) => {
      const nextUrl = URL.createObjectURL(file);
      setObjectUrl(nextUrl);
      setDurationSeconds(0);
      return () => URL.revokeObjectURL(nextUrl);
    },
  );

  createEffect(
    () => [objectUrl(), selectedSeconds()] as const,
    ([url, seekTarget]) => {
      const video = videoRef;
      if (!video || !url) return;
      const seekTo = Math.min(video.duration || seekTarget, seekTarget);
      if (Number.isFinite(seekTo)) {
        video.currentTime = seekTo;
      }
    },
  );

  return (
    <div class="space-y-3 rounded-[var(--radius-lg)] border border-border-soft bg-background p-4">
      <div class="flex items-center justify-between gap-3">
        <Type as="div" variant="label">
          {props.copy.fields.coverFrame}
        </Type>
        <Type as="div" variant="body-strong">
          {formatTimestamp(selectedSeconds())}
        </Type>
      </div>
      <Show when={objectUrl()}>
        {(url) => (
          <video
            class="aspect-video w-full rounded-[var(--radius-lg)] bg-black object-contain"
            muted
            onLoadedMetadata={(event) => {
              const duration = event.currentTarget.duration;
              setDurationSeconds(Number.isFinite(duration) ? duration : 0);
              event.currentTarget.currentTime = selectedSeconds();
            }}
            playsinline
            preload="metadata"
            ref={videoRef}
            src={url()}
          />
        )}
      </Show>
      <Input
        aria-label={props.copy.fields.coverFrame}
        class="h-12"
        disabled={durationSeconds() <= 0}
        max={Math.max(0, durationSeconds())}
        min={0}
        onChange={(event) => props.onFrameSecondsChange(event.currentTarget.value)}
        step={0.1}
        type="range"
        value={String(selectedSeconds())}
      />
    </div>
  );
}
