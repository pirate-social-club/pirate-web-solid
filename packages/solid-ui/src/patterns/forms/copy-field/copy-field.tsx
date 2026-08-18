import type { JSX } from "@solidjs/web";
import { createMemo, createSignal, omit, onCleanup, Show } from "solid-js";

import { Button } from "@/components/actions/button/button";
import { IconCheck, IconCopy } from "@/components/media/icons";
import { cn } from "@/lib/cn";

export interface CopyFieldProps
  extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "class"> {
  class?: string;
  /** Accessible name for the copied value, used by the copy button. */
  copyLabel?: string;
  value: string;
  /** Preserve the full value on screen instead of truncating it. */
  wrap?: boolean;
}

/**
 * CopyField - a read-only value row with a copy button that writes the value
 * to the clipboard and confirms with a check mark for two seconds. Use it for
 * addresses, invite codes, and IDs. The host is responsible for clipboard
 * availability errors.
 */
export function CopyField(props: CopyFieldProps) {
  const className = createMemo(() =>
    cn(
      "flex h-16 w-full items-center gap-2 overflow-hidden rounded-full border border-input bg-background pe-2 ps-5 shadow-sm",
      props.class,
    ),
  );
  const rest = omit(props, "class", "copyLabel", "value", "wrap");

  const [copied, setCopied] = createSignal(false);
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    if (resetTimer) clearTimeout(resetTimer);
  });

  const handleCopy = () => {
    void navigator.clipboard.writeText(props.value);
    setCopied(true);
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div {...rest} class={className()}>
      <div
        class={cn(
          "min-w-0 flex-1 font-mono text-base text-foreground select-all",
          props.wrap ? "break-all whitespace-normal" : "truncate",
        )}
      >
        {props.value}
      </div>
      <Button
        aria-label={
          copied() ? `${props.copyLabel ?? "value"} copied` : `Copy ${props.copyLabel ?? "value"}`
        }
        class="my-1 size-9 shrink-0"
        onClick={handleCopy}
        size="icon"
        variant="secondary"
      >
        <Show
          when={copied()}
          fallback={<IconCopy class="size-5" />}
        >
          <IconCheck class="size-5" />
        </Show>
      </Button>
    </div>
  );
}
