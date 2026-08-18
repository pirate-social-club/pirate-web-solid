import {
  AlertDialog as KAlertDialog,
  type AlertDialogContentProps as KAlertDialogContentProps,
} from "@kobalte/core/alert-dialog";
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

const AlertDialog = KAlertDialog;
const AlertDialogTrigger = KAlertDialog.Trigger;

export interface AlertDialogContentProps extends KAlertDialogContentProps {
  class?: string;
  hideCloseButton?: boolean;
}

function AlertDialogContent(props: ParentProps<AlertDialogContentProps>) {
  const className = createMemo(() => cn(dialogContentClass, props.class));
  const rest = omit(props, "class", "hideCloseButton", "children");

  return (
    <KAlertDialog.Portal>
      <KAlertDialog.Overlay class={dialogOverlayClass} />
      <KAlertDialog.Content class={className()} {...rest}>
        {props.children}
        <Show when={!props.hideCloseButton}>
          <DialogCloseButtonLayout part={KAlertDialog.CloseButton} />
        </Show>
      </KAlertDialog.Content>
    </KAlertDialog.Portal>
  );
}

const AlertDialogHeader = DialogHeaderLayout;
const AlertDialogFooter = DialogFooterLayout;

function AlertDialogTitle(
  props: ParentProps<Parameters<typeof KAlertDialog.Title>[0]>,
) {
  const className = createMemo(() => cn(dialogTitleClass, props.class));
  const rest = omit(props, "class");

  return (
    <KAlertDialog.Title class={className()} {...rest}>
      {props.children}
    </KAlertDialog.Title>
  );
}

function AlertDialogDescription(
  props: ParentProps<Parameters<typeof KAlertDialog.Description>[0]>,
) {
  const className = createMemo(() => cn(dialogDescriptionClass, props.class));
  const rest = omit(props, "class");

  return (
    <KAlertDialog.Description class={className()} {...rest}>
      {props.children}
    </KAlertDialog.Description>
  );
}

export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
};
