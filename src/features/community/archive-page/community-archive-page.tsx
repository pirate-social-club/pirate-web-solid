import { For, Show, createEffect, createSignal } from "solid-js";

import { Button, FormNote, Type, cn } from "@pirate/web-solid-ui";
import {
  archiveCopy,
  isArchiveSaving,
  type CommunityArchiveStatus,
  type CommunityArchiveSubmitState,
} from "./archive-page-model";

export type { CommunityArchiveStatus, CommunityArchiveSubmitState } from "./archive-page-model";

export interface CommunityArchivePageProps {
  class?: string;
  className?: string;
  status: CommunityArchiveStatus;
  submitState: CommunityArchiveSubmitState;
  onArchive?: () => void;
  onUnarchive?: () => void;
}

export function CommunityArchivePage(props: CommunityArchivePageProps) {
  const [confirming, setConfirming] = createSignal(false);
  let previousStatus: CommunityArchiveStatus | undefined;
  const focusById = (id: string) => {
    if (typeof document === "undefined") return;
    queueMicrotask(() => document.getElementById(id)?.focus());
  };

  createEffect(() => props.status, (status) => {
    if (status === "archived") setConfirming(false);
    if (previousStatus !== undefined && previousStatus !== status) {
      focusById(status === "archived" ? "community-archive-unarchive" : "community-archive-action");
    }
    previousStatus = status;
    return undefined;
  });

  const saving = () => isArchiveSaving(props.submitState);
  const submitError = () => {
    const state = props.submitState;
    return state.kind === "error" ? state.message : undefined;
  };
  const openConfirmation = () => {
    setConfirming(true);
    focusById("community-archive-confirm");
  };
  const cancelConfirmation = () => {
    setConfirming(false);
    focusById("community-archive-action");
  };

  return (
    <section class={cn("mx-auto flex w-full max-w-5xl flex-col gap-6 md:gap-8", props.class, props.className)} data-community-archive>
      <div class="space-y-2">
        <Type as="h1" responsiveSize="desktop4xl" variant="h1" class="text-destructive">{archiveCopy.title}</Type>
        <FormNote>{archiveCopy.intro}</FormNote>
      </div>

      <Show
        when={props.status === "active"}
        fallback={
          <section class="space-y-4 rounded-md border border-border-soft bg-muted/20 p-5 md:p-6">
            <Type as="h2" variant="h2">{archiveCopy.archivedTitle}</Type>
            <FormNote>{archiveCopy.archivedBody}</FormNote>
            <Button id="community-archive-unarchive" loading={saving()} onClick={() => props.onUnarchive?.()}>
              {archiveCopy.unarchiveAction}
            </Button>
          </section>
        }
      >
        <section class="space-y-4 rounded-md border border-destructive/40 bg-destructive/5 p-5 md:p-6">
          <Type as="h2" variant="h2">{archiveCopy.effectsTitle}</Type>
          <Type as="ul" class="list-disc space-y-1.5 pl-5" variant="body">
            <For each={archiveCopy.effects}>{(effect) => <li>{effect}</li>}</For>
          </Type>

          <Show
            when={confirming()}
            fallback={
              <Button id="community-archive-action" disabled={saving()} onClick={openConfirmation} variant="destructive">
                {archiveCopy.archiveAction}
              </Button>
            }
          >
            <div class="space-y-3 border-t border-destructive/30 pt-4">
              <Type as="p" variant="body-strong">{archiveCopy.confirmTitle}</Type>
              <FormNote>{archiveCopy.confirmBody}</FormNote>
              <div class="flex flex-wrap gap-3">
                <Button id="community-archive-confirm" loading={saving()} onClick={() => props.onArchive?.()} variant="destructive">
                  {archiveCopy.confirmAction}
                </Button>
                <Button disabled={saving()} onClick={cancelConfirmation} variant="ghost">{archiveCopy.cancelAction}</Button>
              </div>
            </div>
          </Show>
        </section>
      </Show>

      <Show when={submitError()}>
        <Type as="p" class="text-destructive-text" role="alert" variant="body">{submitError()}</Type>
      </Show>
    </section>
  );
}
