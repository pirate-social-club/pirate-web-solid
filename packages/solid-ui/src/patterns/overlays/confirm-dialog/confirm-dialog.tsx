import { createSignal } from "solid-js";

import { Button, buttonVariants } from "@/components/actions/button/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/overlays/alert-dialog/alert-dialog";
import { useDialogContext } from "@/components/overlays/dialog/dialog";

export interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  onConfirm: () => void;
}

function ConfirmDialogFooter(props: {
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  const context = useDialogContext();

  return (
    <AlertDialogFooter>
      <Button variant="outline" onClick={() => context.close()}>
        {props.cancelLabel ?? "Cancel"}
      </Button>
      <Button
        variant={props.destructive ? "destructive" : "default"}
        onClick={() => {
          props.onConfirm();
          context.close();
        }}
      >
        {props.confirmLabel ?? "Confirm"}
      </Button>
    </AlertDialogFooter>
  );
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const [open, setOpen] = createSignal(false);

  return (
    <AlertDialog open={open()} onOpenChange={setOpen}>
      <AlertDialogTrigger
        class={buttonVariants({ variant: props.triggerVariant ?? "default" })}
      >
        {props.triggerLabel ?? "Open"}
      </AlertDialogTrigger>
      <AlertDialogContent hideCloseButton>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <ConfirmDialogFooter
          confirmLabel={props.confirmLabel}
          cancelLabel={props.cancelLabel}
          destructive={props.destructive}
          onConfirm={props.onConfirm}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}
