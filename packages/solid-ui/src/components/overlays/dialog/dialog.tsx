import {
  Dialog as KDialog,
  useDialogContext,
  type DialogContentProps as KDialogContentProps,
} from "@kobalte/core/dialog";
import { createMemo, omit, Show, type ParentProps } from "solid-js";

import {
  dialogContentClass,
  dialogDescriptionClass,
  dialogOverlayClass,
  dialogTitleClass,
  DialogCloseButtonLayout,
  DialogFooterLayout,
  DialogHeaderLayout,
} from "@/components/overlays/dialog-presentation";
import { cn } from "@/lib/cn";

const Dialog = KDialog;
const DialogTrigger = KDialog.Trigger;

export interface DialogContentProps extends KDialogContentProps {
  class?: string;
  dir?: "ltr" | "rtl" | "auto";
  hideCloseButton?: boolean;
}

function DialogContent(props: ParentProps<DialogContentProps>) {
  const className = createMemo(() => cn(dialogContentClass, props.class));
  const rest = omit(props, "class", "hideCloseButton", "children");

  return (
    <KDialog.Portal>
      <KDialog.Overlay class={dialogOverlayClass} />
      <KDialog.Content class={className()} {...rest}>
        {props.children}
        <Show when={!props.hideCloseButton}>
          <DialogCloseButtonLayout part={KDialog.CloseButton} />
        </Show>
      </KDialog.Content>
    </KDialog.Portal>
  );
}

const DialogHeader = DialogHeaderLayout;
const DialogFooter = DialogFooterLayout;

function DialogTitle(props: ParentProps<Parameters<typeof KDialog.Title>[0]>) {
  const className = createMemo(() => cn(dialogTitleClass, props.class));
  const rest = omit(props, "class");

  return (
    <KDialog.Title class={className()} {...rest}>
      {props.children}
    </KDialog.Title>
  );
}

function DialogDescription(
  props: ParentProps<Parameters<typeof KDialog.Description>[0]>,
) {
  const className = createMemo(() => cn(dialogDescriptionClass, props.class));
  const rest = omit(props, "class");

  return (
    <KDialog.Description class={className()} {...rest}>
      {props.children}
    </KDialog.Description>
  );
}

export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  useDialogContext,
};
