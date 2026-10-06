/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { Show, onSettled } from "solid-js";

import {
  Button,
  Card,
  Checkbox,
  CheckboxLabel,
  FormNote,
  IconButton,
  IconMusicNote,
  IconVideoCamera,
  IconX,
  Input,
  Textarea,
} from "../../../design-system";

export interface TextPostDraft {
  readonly title: string;
  readonly body: string;
  readonly ageGatePolicy: "none" | "18_plus";
}

export const emptyTextPostDraft: TextPostDraft = { title: "", body: "", ageGatePolicy: "none" };

export interface TextPostPanelProps {
  readonly draft: TextPostDraft;
  readonly onDraftChange: (draft: TextPostDraft) => void;
  readonly onPost: () => void;
  readonly onClose: () => void;
  /** Absent when the surface cannot start that kind of post. */
  readonly onSong?: (file: File) => void;
  readonly onVideo?: () => void;
  /** Why posting is unavailable, such as no profile for this community. */
  readonly unavailable?: string;
}

/**
 * The text composer. On desktop it is a card in the community page's right
 * column; on a phone the same element is a sheet over the bottom of the
 * screen. It only edits: pressing Post hands the text to the application's
 * submission owner and the post appears in the feed, so this panel has no
 * sending, waiting or failed state of its own.
 */
export function TextPostPanel(props: TextPostPanelProps): JSX.Element {
  let bodyInput: HTMLTextAreaElement | undefined;
  let songInput: HTMLInputElement | undefined;
  onSettled(() => { bodyInput?.focus(); });
  const canPost = () => props.unavailable === undefined && props.draft.body.trim() !== "";
  const post = () => { if (canPost()) props.onPost(); };

  return (
    <div
      class="max-md:fixed max-md:inset-0 max-md:z-50 max-md:flex max-md:flex-col max-md:justify-end"
      data-text-post-panel
      onKeyDown={(event) => {
        if (event.key === "Escape") props.onClose();
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) post();
      }}
    >
      <button
        aria-label="Close composer"
        class="absolute inset-0 bg-black/40 md:hidden"
        onClick={() => props.onClose()}
        tabindex={-1}
        type="button"
      />
      <Card class="relative max-md:max-h-[100dvh] max-md:overflow-y-auto max-md:rounded-b-none max-md:rounded-t-[var(--radius-3xl)] max-md:border-x-0 max-md:border-b-0 max-md:pb-[env(safe-area-inset-bottom)]">
        <form aria-label="Create a post" class="flex flex-col gap-3 p-4" onSubmit={(event) => { event.preventDefault(); post(); }}>
          <div class="flex items-center gap-2">
            <Input
              aria-label="Title"
              class="h-auto min-w-0 flex-1 px-0 py-0 text-lg font-semibold shadow-none focus-visible:border-transparent focus-visible:ring-0"
              maxlength={300}
              onInput={(event) => props.onDraftChange({ ...props.draft, title: event.currentTarget.value })}
              placeholder="Title (optional)"
              value={props.draft.title}
              variant="flat"
            />
            <IconButton aria-label="Close composer" onClick={() => props.onClose()} type="button" variant="ghost">
              <IconX class="size-5" />
            </IconButton>
          </div>
          <Textarea
            aria-label="Post"
            class="min-h-32 resize-none rounded-none border-0 bg-transparent p-0 text-base leading-relaxed shadow-none focus-visible:ring-0"
            onInput={(event) => props.onDraftChange({ ...props.draft, body: event.currentTarget.value })}
            placeholder="Write your post"
            ref={bodyInput}
            value={props.draft.body}
          />
          <Checkbox
            checked={props.draft.ageGatePolicy === "18_plus"}
            onChange={(next) => props.onDraftChange({ ...props.draft, ageGatePolicy: next === true ? "18_plus" : "none" })}
          >
            <CheckboxLabel class="text-muted-foreground">18+ only</CheckboxLabel>
          </Checkbox>
          <Show when={props.unavailable}>
            {reason => <FormNote tone="warning">{reason()}</FormNote>}
          </Show>
          <div class="flex items-center gap-1 border-t border-border-soft pt-3">
            <Show when={props.onSong}>
              <IconButton aria-label="Post a song" onClick={() => songInput?.click()} type="button" variant="ghost">
                <IconMusicNote class="size-5" />
              </IconButton>
              <input
                accept=".mp3,audio/mpeg"
                aria-label="Choose a song file"
                class="sr-only"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) props.onSong?.(file);
                }}
                ref={songInput}
                tabindex={-1}
                type="file"
              />
            </Show>
            <Show when={props.onVideo}>
              <IconButton aria-label="Post a video" onClick={() => props.onVideo?.()} type="button" variant="ghost">
                <IconVideoCamera class="size-5" />
              </IconButton>
            </Show>
            <Button class="ms-auto min-w-24" disabled={!canPost()} type="submit">Post</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
