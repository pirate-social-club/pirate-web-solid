import type { JSX } from "@solidjs/web";
import { Match, Show, Switch } from "solid-js";

import {
  ActionFooterShell,
  Button,
  FormNote,
  IconArrowLeft,
  IconArrowsClockwise,
  IconButton,
  IconCheckCircle,
  IconImage,
  IconPlay,
  IconUploadSimple,
  IconWarningCircle,
  IconX,
  Spinner,
  StatusCard,
  Textarea,
  Type,
  cn,
} from "../../../design-system";

export type OriginalVideoCaptureStatus =
  | "idle"
  | "recording"
  | "camera_denied"
  | "capability_unavailable"
  | "orientation_lost";

export interface OriginalVideoCaptureSurfaceProps {
  readonly channel?: "camera" | "upload";
  readonly status?: OriginalVideoCaptureStatus;
  readonly elapsedLabel?: string;
  readonly durationLabel?: string;
  readonly onClose?: () => void;
  readonly onRecordToggle?: () => void;
  readonly onUpload?: () => void;
  readonly onRetake?: () => void;
  readonly onFlipCamera?: () => void;
}

/**
 * Presentational phase-one capture surface. A host owns capability probing,
 * camera and microphone streams, orientation locking, recording and files.
 */
export function OriginalVideoCaptureSurface(props: OriginalVideoCaptureSurfaceProps) {
  const channel = () => props.channel ?? "camera";
  const status = () => props.status ?? "idle";
  const recording = () => status() === "recording";
  const cameraControls = () =>
    channel() === "camera" && (status() === "idle" || status() === "recording");

  return (
    <section class="relative h-dvh overflow-hidden bg-black text-white">
      <div class="absolute inset-0 flex items-center justify-center">
        <div
          class="relative h-full max-h-full w-full bg-gradient-to-b from-[#262a30] to-[#0d0f12] sm:aspect-[9/16] sm:w-auto"
          data-video-viewfinder
        >
          <Switch>
            <Match when={channel() === "upload"}>
              <CaptureMessage
                action="Choose a video"
                body="Choose a vertical MP4 or MOV with H.264 video and AAC audio."
                icon={<IconUploadSimple class="size-7" />}
                title="Upload a video"
                onAction={props.onUpload}
              />
            </Match>
            <Match when={status() === "camera_denied"}>
              <CaptureMessage
                action="Choose a video instead"
                body="Camera access is off. You can allow it in browser settings or upload a compatible video."
                icon={<IconWarningCircle class="size-7" />}
                title="Camera unavailable"
                onAction={props.onUpload}
              />
            </Match>
            <Match when={status() === "capability_unavailable"}>
              <CaptureMessage
                action="Choose a compatible video"
                body="This browser cannot record H.264 video with AAC audio. WebM recording is not available for this release."
                icon={<IconWarningCircle class="size-7" />}
                title="Recording is not supported here"
                onAction={props.onUpload}
              />
            </Match>
            <Match when={status() === "orientation_lost"}>
              <CaptureMessage
                action="Retake video"
                body="The phone rotated while recording, so this take ended before it could be finalized. Keep the next take in one orientation."
                icon={<IconArrowsClockwise class="size-7" />}
                title="Retake in one orientation"
                onAction={props.onRetake}
              />
            </Match>
          </Switch>
        </div>
      </div>

      <header class="absolute inset-x-0 top-0 z-10 flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <IconButton
          aria-label="Close video capture"
          class="size-10 bg-black/45 backdrop-blur-sm"
          onClick={() => props.onClose?.()}
          variant="secondary"
        >
          <IconX class="size-5" />
        </IconButton>
        <Type as="h1" variant="body-strong" class="min-w-0 flex-1 text-center text-white">
          New video
        </Type>
        <span aria-hidden="true" class="size-10" />
      </header>

      <Show when={cameraControls()}>
        <div class="absolute inset-x-0 bottom-0 z-10 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <Show when={props.elapsedLabel && props.durationLabel}>
            <div class="mb-5 flex justify-center">
              <span class="inline-flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-sm font-medium tabular-nums backdrop-blur-sm" role="timer">
                <span
                  aria-hidden="true"
                  class={cn("size-2 rounded-full", recording() ? "bg-destructive" : "bg-white/45")}
                />
                {`${props.elapsedLabel} / ${props.durationLabel}`}
              </span>
            </div>
          </Show>
          <div class="grid grid-cols-3 items-center justify-items-center">
            <CaptureSideAction
              icon={<IconImage class="size-5" />}
              label="Upload"
              onClick={() => props.onUpload?.()}
            />
            <button
              aria-label={recording() ? "Stop recording" : "Start recording"}
              aria-pressed={recording()}
              class="grid size-[74px] cursor-pointer place-items-center rounded-full border-4 border-white outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-black"
              onClick={() => props.onRecordToggle?.()}
              type="button"
            >
              <span
                class={cn(
                  "bg-[#f0453a] transition-[border-radius,width,height] duration-200 motion-reduce:transition-none",
                  recording() ? "size-6 rounded-[6px]" : "size-[58px] rounded-full",
                )}
              />
            </button>
            <CaptureSideAction
              icon={<IconArrowsClockwise class="size-5" />}
              label="Flip"
              onClick={() => props.onFlipCamera?.()}
            />
          </div>
        </div>
      </Show>
    </section>
  );
}

function CaptureMessage(props: {
  readonly action: string;
  readonly body: string;
  readonly icon: JSX.Element;
  readonly title: string;
  readonly onAction?: () => void;
}) {
  return (
    <div class="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <span class="grid size-16 place-items-center rounded-full bg-white/10">{props.icon}</span>
      <div class="space-y-2">
        <Type as="h2" variant="h3" class="text-white">{props.title}</Type>
        <Type as="p" variant="body" class="max-w-sm text-white/70">{props.body}</Type>
      </div>
      <Button onClick={() => props.onAction?.()} size="lg">{props.action}</Button>
    </div>
  );
}

function CaptureSideAction(props: {
  readonly icon: JSX.Element;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      class="flex cursor-pointer flex-col items-center gap-1.5 rounded-[var(--radius-lg)] p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={props.onClick}
      type="button"
    >
      <span class="grid size-11 place-items-center rounded-[var(--radius-lg)] bg-white/10 backdrop-blur-sm">
        {props.icon}
      </span>
      <span class="text-xs text-white">{props.label}</span>
    </button>
  );
}

export interface OriginalVideoReviewSurfaceProps {
  readonly caption?: string;
  readonly submitting?: boolean;
  readonly onBack?: () => void;
  readonly onCaptionChange?: (value: string) => void;
  readonly onPublish?: () => void;
}

/** Review step with one optional caption and read-only phase-one settings. */
export function OriginalVideoReviewSurface(props: OriginalVideoReviewSurfaceProps) {
  return (
    <ActionFooterShell
      class="bg-background text-foreground"
      footer={(
        <Button
          class="w-full"
          disabled={props.submitting}
          loading={props.submitting}
          onClick={() => props.onPublish?.()}
          size="lg"
        >
          Publish video
        </Button>
      )}
      fullViewport
      header={(
        <header class="flex items-center gap-3 border-b border-border-soft px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <IconButton aria-label="Back to capture" onClick={() => props.onBack?.()} variant="ghost">
            <IconArrowLeft class="size-5" />
          </IconButton>
          <Type as="h1" variant="body-strong" class="flex-1 text-center">Review video</Type>
          <span aria-hidden="true" class="size-10" />
        </header>
      )}
    >
      <div class="mx-auto grid w-full max-w-4xl gap-6 p-4 md:grid-cols-[minmax(15rem,22rem)_1fr] md:p-6">
        <div class="relative mx-auto aspect-[9/16] h-auto max-h-[58dvh] w-full max-w-sm overflow-hidden rounded-[var(--radius-2xl)] bg-gradient-to-b from-[#262a30] to-[#0d0f12]">
          <IconButton
            aria-label="Play video preview"
            class="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 bg-black/60"
            variant="secondary"
          >
            <IconPlay class="size-7" />
          </IconButton>
        </div>

        <div class="space-y-5">
          <div class="space-y-2">
            <label for="original-video-caption" class="text-sm font-medium">Caption <span class="text-muted-foreground">optional</span></label>
            <Textarea
              id="original-video-caption"
              maxlength={2_200}
              onInput={(event) => props.onCaptionChange?.(event.currentTarget.value)}
              placeholder="Say something about this video"
              rows={4}
              value={props.caption ?? ""}
            />
          </div>

          <section class="space-y-3" aria-labelledby="video-settings-heading">
            <Type as="h2" id="video-settings-heading" variant="body-strong">Settings</Type>
            <div class="divide-y divide-border-soft rounded-[var(--radius-2xl)] border border-border-soft bg-card px-4">
              <ReadOnlySetting label="Source" value="Original audio" />
              <ReadOnlySetting label="Poster" value="Generated after upload" />
              <ReadOnlySetting label="Rights" value="Recorded soundtrack · checked before publishing" />
            </div>
            <FormNote tone="muted">
              The soundtrack in this video is published as its original sound. A known recording may require a different posting flow or manual review.
            </FormNote>
          </section>
        </div>
      </div>
    </ActionFooterShell>
  );
}

function ReadOnlySetting(props: { readonly label: string; readonly value: string }) {
  return (
    <div class="flex items-start justify-between gap-4 py-4">
      <Type as="span" variant="body" class="text-muted-foreground">{props.label}</Type>
      <Type as="span" variant="body-strong" class="text-right">{props.value}</Type>
    </div>
  );
}

export type OriginalVideoPublicationState =
  | "uploading"
  | "processing"
  | "known_recording"
  | "rights_review"
  | "moderation_hold"
  | "failed"
  | "playback_pending";

const publicationCopy: Record<OriginalVideoPublicationState, Readonly<{
  title: string;
  description: string;
  tone: "default" | "warning" | "destructive" | "success";
}>> = {
  uploading: {
    title: "Uploading video",
    description: "Keep this page open while the original file uploads.",
    tone: "default",
  },
  processing: {
    title: "Checking your video",
    description: "We are checking its format, soundtrack, poster frames and audience rating before publishing.",
    tone: "default",
  },
  known_recording: {
    title: "This soundtrack matches a known song",
    description: "An original-audio post cannot publish this recording. Retake with different audio or restart later through the song-reference flow.",
    tone: "warning",
  },
  rights_review: {
    title: "Soundtrack review needed",
    description: "The video is private while a moderator reviews the retained soundtrack evidence. No post is public yet.",
    tone: "warning",
  },
  moderation_hold: {
    title: "Video review needed",
    description: "The video and caption are private while a moderator reviews them. No post is public yet.",
    tone: "warning",
  },
  failed: {
    title: "Video could not be published",
    description: "Your file is still attached to this attempt. Retry with the same video or choose a different compatible file.",
    tone: "destructive",
  },
  playback_pending: {
    title: "Your video is published",
    description: "The post is live, but playback is still being prepared. It will become watchable without another upload.",
    tone: "success",
  },
};

export function OriginalVideoPublicationSurface(props: {
  readonly state: OriginalVideoPublicationState;
  readonly onPrimaryAction?: () => void;
}) {
  const copy = () => publicationCopy[props.state];
  const busy = () => props.state === "uploading" || props.state === "processing";
  const action = () => {
    if (props.state === "known_recording") return "Retake video";
    if (props.state === "failed") return "Retry";
    if (props.state === "playback_pending") return "View post";
    return null;
  };

  return (
    <main class="grid min-h-dvh place-items-center bg-background p-4 text-foreground">
      <div class="w-full max-w-xl space-y-5">
        <div class="mx-auto grid aspect-[9/16] max-h-[48dvh] w-auto place-items-center rounded-[var(--radius-2xl)] bg-gradient-to-b from-[#262a30] to-[#0d0f12] text-white">
          <Show
            when={busy()}
            fallback={props.state === "playback_pending"
              ? <IconCheckCircle class="size-10" />
              : <IconWarningCircle class="size-10" />}
          >
            <Spinner label={copy().title} />
          </Show>
        </div>
        <StatusCard
          actions={(
            <Show when={action()}>
              {(label) => <Button onClick={() => props.onPrimaryAction?.()}>{label()}</Button>}
            </Show>
          )}
          description={copy().description}
          title={copy().title}
          tone={copy().tone}
        />
      </div>
    </main>
  );
}
