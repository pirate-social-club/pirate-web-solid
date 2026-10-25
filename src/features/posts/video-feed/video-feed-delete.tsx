import { Show } from "solid-js";
import { Button, Modal, ModalContent, ModalDescription, ModalTitle } from "../../../design-system.ts";

export function VideoFeedDelete(props: {
  readonly open: boolean;
  readonly busy: boolean;
  readonly error?: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDelete: () => void;
  readonly onCloseAutoFocus: (event: Event) => void;
}) {
  return <Modal open={props.open} onOpenChange={props.onOpenChange}>
    <ModalContent class="gap-4 bg-background p-5 md:max-w-[420px]" closeButtonDisabled={props.busy} onCloseAutoFocus={props.onCloseAutoFocus}>
      <ModalTitle class="pe-10 text-xl font-semibold">Delete your video?</ModalTitle>
      <ModalDescription>This removes your published video from Pirate. It can't be undone. People may still have copies they saved.</ModalDescription>
      <p class="text-sm text-muted-foreground">Your private Dance recording and earned qualifications stay in your account.</p>
      <Show when={props.error}>{message => <p role="alert" class="text-sm text-destructive-text">{message()}</p>}</Show>
      <div class="flex flex-wrap justify-end gap-3" aria-busy={props.busy ? "true" : "false"}>
        <Button variant="outline" disabled={props.busy} onClick={() => props.onOpenChange(false)}>Keep video</Button>
        <Button variant="destructive" disabled={props.busy} onClick={props.onDelete}>{props.busy ? "Deleting…" : props.error ? "Retry deletion" : "Delete video"}</Button>
      </div>
    </ModalContent>
  </Modal>;
}
