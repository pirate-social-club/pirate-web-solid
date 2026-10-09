/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { Show, onSettled } from "solid-js";

import {
  Button,
  Card,
  FormNote,
  IconArrowUp,
  IconButton,
  IconMusicNote,
  IconVideoCamera,
  IconX,
  Input,
  Textarea,
  Type,
} from "../../../design-system";
import { createPhoneLayout } from "../../shell/composing-surface.tsx";

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
 *
 * On a phone the form is a flat surface: no card and no heading, with the
 * 2026-09-24 action bar above the fields, close on the left and the publish
 * arrow on the right, kept on screen while the page scrolls. Song and Video
 * sit in a plain row under the text field, and there is no footer. The rules
 * are stated once in tasks/records/solid-composer-mobile-flat-surface.md.
 */
export function TextPostPanel(props: TextPostPanelProps): JSX.Element {
  let bodyInput: HTMLTextAreaElement | undefined;
  let songInput: HTMLInputElement | undefined;
  onSettled(() => { bodyInput?.focus(); });
  const canPost = () => props.unavailable === undefined && props.draft.body.trim() !== "";
  const post = () => { if (canPost()) props.onPost(); };

  const isMobile = createPhoneLayout();

  const songEntry = () => (
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
  );
  const videoEntry = () => (
    <Show when={props.onVideo}>
      <Button class="min-w-0 px-3" aria-label="Post a video" leadingIcon={<IconVideoCamera class="size-5" />} onClick={() => props.onVideo?.()} type="button" variant="outline">Video</Button>
    </Show>
  );
  const fields = (mobile: boolean) => (
    <>
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
          class={mobile ? "min-h-40 w-full resize-y text-base leading-relaxed" : "min-h-48 w-full resize-y text-base leading-relaxed md:min-h-64"}
          onInput={(event) => props.onDraftChange({ ...props.draft, body: event.currentTarget.value })}
          placeholder="Write your post"
          ref={bodyInput}
          value={props.draft.body}
        />
      </label>
      <Show when={props.unavailable}>
        {reason => <FormNote tone="warning">{reason()}</FormNote>}
      </Show>
    </>
  );

  return (
    <div
      class="w-full min-w-0"
      data-text-post-panel
      data-presentation={isMobile() ? "flat" : "card"}
      onKeyDown={(event) => {
        if (event.key === "Escape") props.onClose();
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) post();
      }}
    >
      <Show
        when={isMobile()}
        fallback={
          <Card class="w-full">
            <form aria-label="Create a post" class="flex flex-col gap-5 p-5 md:p-6" onSubmit={(event) => { event.preventDefault(); post(); }}>
              <div class="flex items-center justify-between gap-3">
                <Type as="h2" variant="h2">Create a post</Type>
                <Button aria-label="Cancel" onClick={() => props.onClose()} type="button" variant="ghost">Cancel</Button>
              </div>
              {fields(false)}
              <div class="flex flex-wrap items-center gap-2 border-t border-border-soft pt-4">
                {songEntry()}
                {videoEntry()}
                <Button class="ms-auto min-w-24" disabled={!canPost()} type="submit">Post</Button>
              </div>
            </form>
          </Card>
        }
      >
        <form aria-label="Create a post" class="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); post(); }}>
          <header class="sticky top-0 z-20 -mx-4 flex min-h-14 items-center justify-between bg-background px-3 pt-[env(safe-area-inset-top)]" data-composer-sticky-header>
            <IconButton aria-label="Close composer" onClick={() => props.onClose()} type="button" variant="ghost">
              <IconX class="size-5" />
            </IconButton>
            <IconButton aria-label="Post" disabled={!canPost()} type="submit" variant="default">
              <IconArrowUp class="size-5" />
            </IconButton>
          </header>
          {fields(true)}
          <div aria-label="Add to your post" class="flex flex-wrap items-center gap-2" role="group">
            {songEntry()}
            {videoEntry()}
          </div>
        </form>
      </Show>
    </div>
  );
}
