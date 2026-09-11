// Song step (step 1 of 4): title (prefilled from ID3 or the filename), the
// audio card, and cover art. The audio file is the only hard requirement;
// title is prefilled and editable. Next stays disabled until an audio file is
// present.

import { createSignal, Show } from "solid-js";

import {
  CardContent,
  IconImage,
  IconMusicNote,
  IconUploadSimple,
  IconX,
  Input,
  Type,
} from "../../../design-system";
import { cn } from "../../../design-system";
import { extractEmbeddedAudioArtworkFile, extractEmbeddedAudioTitle } from "./audio-artwork";
import { PostComposerAttachmentCard } from "./attachment-card";
import { FieldLabel } from "./fields";
import { createObjectUrl } from "./media-hooks";
import type { PostComposerController } from "./controller";
import type { SongFlowRuntime } from "./types";

const acceptedImageMimeTypes = "image/jpeg,image/png,image/webp,image/gif,image/avif";
const mp3OnlyCopy = "Public-song v1 currently accepts MP3 only.";

function titleFromFilename(name: string): string {
  const index = name.lastIndexOf(".");
  return (index > 0 ? name.slice(0, index) : name).trim();
}

export function SongStep(props: {
  controller: PostComposerController;
  runtime?: SongFlowRuntime;
}) {
  const controller = props.controller;
  const song = () => controller.song.state;
  const coverPreview = createObjectUrl(() => song().coverUpload);
  const [dragging, setDragging] = createSignal(false);
  const [readingFile, setReadingFile] = createSignal(false);
  const [fileError, setFileError] = createSignal<string | null>(null);
  const audioLocked = () => props.runtime?.retained === true;
  let dragCounter = 0;
  let audioInput: HTMLInputElement | undefined;
  let coverInput: HTMLInputElement | undefined;

  const attachment = () => {
    const upload = song().primaryAudioUpload;
    const label = upload?.name ?? song().primaryAudioLabel;
    return label?.trim() ? { kind: "song", label, artworkUrl: coverPreview() } as const : null;
  };

  let fileSelection = 0;
  async function selectFile(file: File | undefined) {
    if (!file || audioLocked()) return;
    const selection = ++fileSelection;
    if (file.type !== "audio/mpeg" || !file.name.toLowerCase().endsWith(".mp3")) {
      setFileError(mp3OnlyCopy);
      return;
    }
    setFileError(null);
    setReadingFile(true);
    try {
      const [embeddedTitle, artwork] = await Promise.all([
        extractEmbeddedAudioTitle(file),
        extractEmbeddedAudioArtworkFile(file),
      ]);
      if (selection !== fileSelection || audioLocked()) return;
      controller.song.update(current => ({
        ...current,
        primaryAudioUpload: file,
        primaryAudioLabel: file.name,
        title: current.title?.trim() || embeddedTitle || titleFromFilename(file.name),
        coverUpload: current.coverUpload ?? artwork,
        coverLabel: current.coverLabel ?? artwork?.name,
        coverSource: current.coverSource ?? (artwork ? "embedded" : undefined),
        lyricsEditorState: "hidden",
      }));
    } catch {
      setFileError("The audio file could not be read. Choose it again.");
    } finally {
      if (selection === fileSelection) setReadingFile(false);
    }
  }

  const drop = (event: DragEvent) => {
    event.preventDefault();
    dragCounter = 0;
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void selectFile(file);
  };

  const removeAudio = () => {
    controller.song.update((state) => ({
      ...state,
      primaryAudioUpload: null,
      primaryAudioLabel: undefined,
    }));
    // Removing the audio returns to the text composer, matching the entry
    // that selected it: with no song attached there is nothing to review.
    controller.tabs.onTabChange("text");
  };

  const removeCover = () => {
    controller.song.update((state) => ({
      ...state,
      coverLabel: undefined,
      coverSource: undefined,
      coverUpload: null,
    }));
  };

  return (
    <CardContent
      class={cn(
        "relative space-y-6 p-8",
        controller.isMobile() && "px-0 pb-4 pt-1",
        dragging() && "overflow-hidden",
      )}
      onDragEnter={(event) => { event.preventDefault(); dragCounter += 1; setDragging(true); }}
      onDragLeave={(event) => { event.preventDefault(); dragCounter -= 1; if (dragCounter <= 0) setDragging(false); }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={drop}
    >
      <Type as="h2" variant="h3">{controller.copy.steps.song}</Type>
      <Show when={dragging()}>
        <div class="absolute inset-0 z-10 grid place-items-center rounded-[var(--radius-lg)] border-2 border-dashed border-primary bg-primary-subtle/80">
          <div class="flex flex-col items-center gap-3">
            <IconUploadSimple class="size-10 text-primary" />
            <Type as="p" variant="body-strong" class="text-primary">Drop a song to attach it</Type>
          </div>
        </div>
      </Show>

      <div>
        <FieldLabel htmlFor="song-track-title" label="Song title" required />
        <Input
          id="song-track-title"
          disabled={audioLocked() || readingFile()}
          maxlength={300}
          onChange={(event) => controller.song.update((current) => ({ ...current, title: event.currentTarget.value }))}
          placeholder="Track title"
          value={song().title ?? ""}
        />
      </div>

      <section class="space-y-3">
        <FieldLabel label="Audio" required />
        <Show
          when={attachment()}
          fallback={
            <button
              class="grid w-full cursor-pointer place-items-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed border-border-soft bg-muted/20 px-4 py-10 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => audioInput?.click()}
              type="button"
            >
              <IconMusicNote class="size-8" />
              <Type as="span" variant="body-strong">Add audio</Type>
            </button>
          }
        >
          <PostComposerAttachmentCard
            attachment={attachment()!}
            onChange={() => undefined}
            onRemove={removeAudio}
            onReplace={() => audioInput?.click()}
          />
        </Show>
        <Show when={fileError()}>
          <Type as="p" variant="caption" class="text-destructive-text">{fileError()}</Type>
        </Show>
      </section>

      <section class="space-y-3">
        <FieldLabel label={controller.copy.fields.coverArt} />
        <Show
          when={coverPreview()}
          fallback={
            <button
              class="grid aspect-square w-32 cursor-pointer place-items-center rounded-[var(--radius-lg)] border-2 border-dashed border-border-soft text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => coverInput?.click()}
              type="button"
            >
              <div class="flex flex-col items-center gap-2">
                <IconImage class="size-6" />
                <Type as="span" variant="caption">Add</Type>
              </div>
            </button>
          }
        >
          {(url) => (
            <div class="relative w-32">
              <img
                alt=""
                class="aspect-square w-32 rounded-[var(--radius-lg)] border border-border-soft object-cover"
                src={url()}
              />
              <button
                aria-label="Remove cover"
                class="absolute right-2 top-2 grid size-8 cursor-pointer place-items-center rounded-full bg-background/85 text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={removeCover}
                type="button"
              >
                <IconX class="size-4" />
              </button>
            </div>
          )}
        </Show>
        <input
          accept={acceptedImageMimeTypes}
          aria-label={controller.copy.fields.coverArt}
          class="sr-only"
          onChange={(event) => {
            const files = event.currentTarget.files;
            controller.song.update((current) => ({
              ...current,
              coverLabel: files?.[0]?.name ?? current.coverLabel,
              coverSource: files?.[0] ? "upload" : undefined,
              coverUpload: files?.[0] ?? null,
            }));
            event.currentTarget.value = "";
          }}
          ref={coverInput}
          type="file"
        />
      </section>

      <input
        accept=".mp3,audio/mpeg"
        aria-label="Upload audio"
        class="sr-only"
        disabled={audioLocked() || readingFile()}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void selectFile(file);
          event.currentTarget.value = "";
        }}
        ref={audioInput}
        type="file"
      />
    </CardContent>
  );
}
