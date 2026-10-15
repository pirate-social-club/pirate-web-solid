import { For, Show } from "solid-js";

import { createIsMobile, Modal, ModalContent, ModalTitle } from "../../../design-system.ts";
import type { CommentReportReason } from "../post-engagement/post-engagement-api.ts";
import { REPORT_REASONS } from "../post-engagement/pending-engagement-flow.ts";

export interface VideoFeedReportProps {
  readonly open: boolean;
  readonly busy: boolean;
  readonly error?: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChoose: (reason: CommentReportReason) => void;
}

/**
 * The feed's Report reasons: a bottom sheet on phone, a 420px dialog on
 * desktop. One tap on a reason sends it; the host owns the submission.
 */
export function VideoFeedReport(props: VideoFeedReportProps) {
  const mobile = createIsMobile();
  return (
    <Modal open={props.open} onOpenChange={props.onOpenChange} forceMobile={mobile()}>
      <ModalContent
        hideCloseButtonOnMobile
        class={mobile()
          ? "gap-0 border-x-0 border-b-0 border-t border-border bg-background px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_24px_80px_#0000002E]"
          : "w-[min(100%-2rem,420px)] gap-0 rounded-[var(--radius-lg)] border-border-soft bg-card px-6 pb-4 pt-2 shadow-none"}
      >
        <Show when={mobile()}>
          <div aria-hidden="true" class="justify-self-center pb-3">
            <div class="h-1.5 w-12 rounded-full bg-border" />
          </div>
        </Show>
        <div class={mobile() ? "pb-3 pt-1" : "flex h-14 items-center"}>
          <ModalTitle class={mobile() ? "text-xl font-semibold leading-7 tracking-normal" : "text-lg font-semibold leading-6 tracking-normal"}>
            Report
          </ModalTitle>
        </div>
        <div class="flex flex-col" aria-busy={props.busy ? "true" : "false"}>
          <For each={REPORT_REASONS}>
            {(reason) => (
              <button
                type="button"
                disabled={props.busy}
                data-report-reason={reason.value}
                class="flex h-12 w-full cursor-pointer items-center border-t border-border-soft text-start text-base leading-6 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:opacity-60"
                onClick={() => props.onChoose(reason.value)}
              >
                {reason.label}
              </button>
            )}
          </For>
        </div>
        <Show when={props.error}>
          {(message) => <p role="alert" class="pt-2 text-sm leading-5 text-destructive-text">{message()}</p>}
        </Show>
      </ModalContent>
    </Modal>
  );
}
