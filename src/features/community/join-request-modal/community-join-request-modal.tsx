/** @jsxImportSource @solidjs/web */

import { Show, createEffect, createSignal, createUniqueId } from "solid-js";

import {
  Button,
  FormNote,
  IconCheckCircle,
  IconUsersThree,
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
  Textarea,
  Type,
} from "@pirate/web-solid-ui";
import { getLocaleMessages, interpolateMessage } from "../../../locales";
import type { GeneratedLocaleCatalogs } from "../../../locales/generated";
import { resolveLocaleDirection } from "../../../lib/ui-locale-core";
import { useUiLocale } from "../../../lib/ui-locale";
import {
  joinRequestNoteCount,
  limitJoinRequestNote,
  MAX_NOTE_LENGTH,
  submitJoinRequestNote,
} from "./join-request-modal-model";

export interface CommunityJoinRequestModalProps {
  communityName: string;
  error?: string | null;
  forceMobile?: boolean;
  initialNote?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (note: string) => Promise<void> | void;
  open: boolean;
  submitted?: boolean;
  submitting?: boolean;
}

type JoinRequestCopy = {
  [Key in keyof GeneratedLocaleCatalogs["en"]["routes"]["joinRequest"]]: string;
};

export function CommunityJoinRequestModal(props: CommunityJoinRequestModalProps) {
  const locale = () => useUiLocale();
  // SAFETY: the generated routes catalog guarantees the joinRequest key shape for every UI locale.
  const copy = () => getLocaleMessages(locale(), "routes").joinRequest as JoinRequestCopy;
  const resolvedDir = () => {
    if (typeof document !== "undefined" && document.documentElement.dir) {
      const documentDirection = document.documentElement.dir;
      if (documentDirection === "ltr" || documentDirection === "rtl" || documentDirection === "auto") return documentDirection;
    }
    return resolveLocaleDirection(locale());
  };
  const uniqueId = createUniqueId();
  const noteId = () => `community-join-request-note-${uniqueId}`;
  const [note, setNote] = createSignal(limitJoinRequestNote(props.initialNote));
  let noteInput: HTMLTextAreaElement | undefined;

  createEffect(
    () => ({ open: props.open, initialNote: props.initialNote }),
    ({ open, initialNote }) => {
      if (open) setNote(limitJoinRequestNote(initialNote));
    },
  );

  const focusNote = () => {
    if (typeof document === "undefined") return;
    queueMicrotask(() => noteInput?.focus());
  };

  createEffect(
    () => ({ open: props.open, submitted: props.submitted }),
    ({ open, submitted }) => {
      if (open && !submitted) focusNote();
    },
  );

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (props.submitting) return;
    void props.onSubmit(submitJoinRequestNote(note()));
  };

  return (
    <Modal forceMobile={props.forceMobile} onOpenChange={props.onOpenChange} open={props.open}>
      <ModalContent dir={resolvedDir()}
        class="flex max-h-[90vh] flex-col overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 sm:max-w-2xl sm:px-8 sm:pb-8 sm:pt-8"
        mobileSide="bottom"
      >
        <div class="contents">
          <ModalHeader class="space-y-5 pe-10 text-start">
            <div class="flex items-center gap-4">
              <span aria-hidden="true" class="grid size-14 shrink-0 place-items-center rounded-full border border-border-soft bg-muted/45 text-foreground sm:size-16">
                <Show when={props.submitted} fallback={<IconUsersThree class="size-8" />}>
                  <IconCheckCircle class="size-8" />
                </Show>
              </span>
              <ModalTitle class="min-w-0" leading="tight" variant="h1">
                {props.submitted ? copy().submittedTitle : copy().title}
              </ModalTitle>
            </div>
            <ModalDescription class="w-full text-foreground" leading="roomy" variant="body">
              {props.submitted ? copy().submittedDescription : copy().description}
            </ModalDescription>
          </ModalHeader>

          <Show when={props.submitted} fallback={
            <form class="mt-8 space-y-6" onSubmit={submit}>
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between gap-4">
                  <label class="min-w-0" for={noteId()}>
                    <Type variant="body-strong">{copy().messageOptional}</Type>
                  </label>
                  <Type as="span" class="shrink-0" variant="caption">
                    {joinRequestNoteCount(note())}/{MAX_NOTE_LENGTH}
                  </Type>
                </div>
                <Textarea ref={noteInput} disabled={props.submitting} id={noteId()} maxlength={MAX_NOTE_LENGTH}
                  onInput={(event) => setNote(limitJoinRequestNote(event.currentTarget.value))}
                  placeholder={interpolateMessage(copy().whyJoinPlaceholder, { communityName: props.communityName })}
                  rows={5}
                  value={note()}
                />
              </div>

              <Show when={props.error}>
                <div aria-live="assertive" role="alert">
                  <FormNote tone="warning">{props.error}</FormNote>
                </div>
              </Show>

              <Button class="h-14 w-full" loading={props.submitting} type="submit">
                {copy().submit}
              </Button>
            </form>
          }>
            <div class="mt-8">
              <Button class="h-14 w-full" onClick={() => props.onOpenChange(false)}>
                {copy().done}
              </Button>
            </div>
          </Show>
        </div>
      </ModalContent>
    </Modal>
  );
}
