import type { Component, ParentProps } from "solid-js";

import { Button } from "@/components/actions/button/button";
import { useDialogContext } from "@/components/overlays/dialog/dialog";

/**
 * Standard cancel/confirm footer for dialog-family stories. Both actions close
 * through the dialog context; confirm runs `onConfirm` first. Uses the public
 * footer part of the family being demonstrated via `as`.
 */
export function StoryDialogFooter(props: {
  /** Public footer part of the dialog family being demonstrated. */
  as: Component<ParentProps>;
  cancelLabel?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void;
}) {
  const context = useDialogContext();

  return (
    <props.as>
      <Button variant="outline" onClick={() => context.close()}>
        {props.cancelLabel ?? "Cancel"}
      </Button>
      <Button
        variant={props.destructive ? "destructive" : "default"}
        onClick={() => {
          props.onConfirm?.();
          context.close();
        }}
      >
        {props.confirmLabel ?? "Continue"}
      </Button>
    </props.as>
  );
}
