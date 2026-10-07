/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { Show, onSettled } from "solid-js";

import {
  Button,
  Card,
  Checkbox,
  CheckboxLabel,
  FormNote,
  IconMusicNote,
  IconVideoCamera,
  Input,
  Textarea,
  Type,
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
 * The post form occupies the community page's main content column. Posting
 * hands the text to the application owner and returns to the feed immediately;
 * delivery and recovery stay with that owner.
 */
export function TextPostPanel(props: TextPostPanelProps): JSX.Element {
  let bodyInput: HTMLTextAreaElement | undefined;
  let songInput: HTMLInputElement | undefined;
  onSettled(() => { bodyInput?.focus(); });
  const canPost = () => props.unavailable === undefined && props.draft.body.trim() !== "";
  const post = () => { if (canPost()) props.onPost(); };

  return (
    <div
      class="w-full min-w-0"
      data-text-post-panel
      onKeyDown={(event) => {
        if (event.key === "Escape") props.onClose();
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) post();
      }}
    >
      <Card class="w-full">
        <form aria-label="Create a post" class="flex flex-col gap-5 p-5 md:p-6" onSubmit={(event) => { event.preventDefault(); post(); }}>
          <div class="flex items-center justify-between gap-3">
            <Type as="h2" variant="h2">Create a post</Type>
            <Button aria-label="Cancel" onClick={() => props.onClose()} type="button" variant="ghost">Cancel</Button>
          </div>
          <label class="flex flex-col gap-2">
            <Type as="span" variant="label">Title <span class="font-normal text-muted-foreground">(optional)</span></Type>
            <Input
              aria-label="Title"
              class="w-full"
              maxlength={300}
              onInput={(event) => props.onDraftChange({ ...props.draft, title: event.currentTarget.value })}
              placeholder="Give your post a title"
              value={props.draft.title}
            />
          </label>
          <label class="flex flex-col gap-2">
            <Type as="span" variant="label">Post</Type>
            <Textarea
              aria-label="Post"
              class="min-h-48 w-full resize-y text-base leading-relaxed md:min-h-64"
              onInput={(event) => props.onDraftChange({ ...props.draft, body: event.currentTarget.value })}
              placeholder="Write your post"
              ref={bodyInput}
              value={props.draft.body}
            />
          </label>
          <Checkbox
            checked={props.draft.ageGatePolicy === "18_plus"}
            onChange={(next) => props.onDraftChange({ ...props.draft, ageGatePolicy: next === true ? "18_plus" : "none" })}
          >
            <CheckboxLabel class="text-muted-foreground">18+ only</CheckboxLabel>
          </Checkbox>
          <Show when={props.unavailable}>
            {reason => <FormNote tone="warning">{reason()}</FormNote>}
          </Show>
          <div class="flex flex-wrap items-center gap-2 border-t border-border-soft pt-4">
            <Show when={props.onSong}>
              <Button class="min-w-0 px-3" aria-label="Post a song" leadingIcon={<IconMusicNote class="size-5" />} onClick={() => songInput?.click()} type="button" variant="outline">Song</Button>
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
              <Button class="min-w-0 px-3" aria-label="Post a video" leadingIcon={<IconVideoCamera class="size-5" />} onClick={() => props.onVideo?.()} type="button" variant="outline">Video</Button>
            </Show>
            <Button class="ms-auto min-w-24" disabled={!canPost()} type="submit">Post</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
