// Song step: the audio first (its card shows the embedded artwork), then the
// title, optional lyrics and the 18+ toggle, one full-width field per row.
// The audio file is the only hard requirement; the title is prefilled from ID3
// or the filename and stays editable.

import { createSignal, Show } from "solid-js";

import {
  CardContent,
  Checkbox,
  CheckboxLabel,
  IconMusicNote,
  IconUploadSimple,
  Input,
  Textarea,
  Type,
} from "../../../design-system";
import { cn } from "../../../design-system";
import { PUBLIC_SONG_LYRICS_MAX_CHARACTERS, publicSongAudioIssue } from "../media-submission/contracts";
import { extractEmbeddedAudioArtworkFile, extractEmbeddedAudioTitle } from "./audio-artwork";
import { PostComposerAttachmentCard } from "./attachment-card";
import { FieldLabel } from "./fields";
import { createObjectUrl } from "./media-hooks";
import type { PostComposerController } from "./controller";
import type { SongFlowRuntime } from "./types";

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

  const attachment = () => {
    const upload = song().primaryAudioUpload;
    const label = upload?.name ?? song().primaryAudioLabel;
    return label?.trim() ? { kind: "song", label, artworkUrl: coverPreview() } as const : null;
  };

  let fileSelection = 0;
  async function selectFile(file: File | undefined) {
    if (!file || audioLocked()) return;
    const selection = ++fileSelection;
    const issue = publicSongAudioIssue(file);
    if (issue !== null) {
      setFileError(issue);
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
        coverUpload: artwork,
        coverLabel: artwork?.name,
        coverSource: artwork ? "embedded" : undefined,
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
      <Show when={!controller.isMobile()}>
        <Type as="h2" variant="h3">{controller.copy.steps.song}</Type>
      </Show>
      <Show when={dragging()}>
        <div class="absolute inset-0 z-10 grid place-items-center rounded-[var(--radius-lg)] border-2 border-dashed border-primary bg-primary-subtle/80">
          <div class="flex flex-col items-center gap-3">
            <IconUploadSimple class="size-10 text-primary" />
            <Type as="p" variant="body-strong" class="text-primary">Drop a song to attach it</Type>
          </div>
        </div>
      </Show>

      <section class="space-y-3">
        <FieldLabel label="Audio" required />
        <Show
          when={attachment()}
          fallback={
            <Show when={audioLocked()} fallback={
            <button
              class="grid w-full cursor-pointer place-items-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed border-border-soft bg-muted/20 px-4 py-10 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => audioInput?.click()}
              type="button"
            >
              <IconMusicNote class="size-8" />
              <Type as="span" variant="body-strong">Add audio</Type>
            </button>
            }>
              <Type as="p" variant="caption" class="text-muted-foreground">
                {props.runtime?.prepared
                  ? "Audio is retained by the server; the browser file is unavailable."
                  : "The browser audio file is unavailable. Cancel this submission to start again."}
              </Type>
            </Show>
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

      <section>
        <FieldLabel htmlFor="song-track-title" label="Song title" required />
        <Input
          id="song-track-title"
          disabled={audioLocked() || readingFile()}
          maxlength={300}
          onChange={(event) => controller.song.update((current) => ({ ...current, title: event.currentTarget.value }))}
          placeholder="Song title"
          value={song().title ?? ""}
        />
      </section>

      <section>
        <FieldLabel htmlFor="song-lyrics" label="Lyrics (optional)" />
        <Textarea
          id="song-lyrics"
          class="min-h-32 resize-y"
          disabled={audioLocked()}
          maxlength={PUBLIC_SONG_LYRICS_MAX_CHARACTERS}
          onChange={(event) => controller.fields.onLyricsValueChange?.(event.currentTarget.value)}
          value={controller.fields.lyricsValue}
        />
      </section>

      <Checkbox
        aria-label="18+ content"
        checked={controller.audience.ageGatePolicy === "18_plus"}
        disabled={controller.audience.editingDisabled}
        onChange={(checked) => controller.audience.setAgeGatePolicy(checked === true ? "18_plus" : "none")}
      >
        <CheckboxLabel>18+ content</CheckboxLabel>
      </Checkbox>

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
