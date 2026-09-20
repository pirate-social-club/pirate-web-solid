/** @jsxImportSource @solidjs/web */
import { Show, createUniqueId } from "solid-js";

import { IconImage, cn } from "../../../design-system";

/**
 * The avatar picker whose circle is the control: click the circle to choose
 * an image, or tab to it and press Enter. The visible circle is a label for
 * the sr-only file input, so it stays out of the accessibility tree while
 * still forwarding clicks; the input keeps the accessible name and keyboard
 * focus, and the circle shows the focus ring while the input holds it.
 */
export function AvatarPicker(props: {
  /** Accessible name for the file input, e.g. "Avatar". */
  label: string;
  src?: string | null;
  /** Initials behind an empty circle until an image is chosen. */
  initials?: string;
  onChange?: (file: File | null) => void;
  class?: string;
}) {
  const inputId = `avatar-picker-${createUniqueId()}`;
  return (
    <span class={cn("relative inline-block", props.class)}>
      <label
        aria-hidden="true"
        class="group flex size-[4.5rem] cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border-soft bg-card text-muted-foreground transition-colors hover:border-primary/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background"
        for={inputId}
      >
        <Show
          when={props.src}
          fallback={
            <Show when={props.initials} fallback={<IconImage class="size-5" />}>
              <span class="text-lg font-semibold text-foreground">{props.initials}</span>
            </Show>
          }
        >
          {(src) => <img alt="" class="size-full object-cover" src={src()} />}
        </Show>
        <span aria-hidden="true" class="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100">
          <IconImage class="size-5 text-white" />
        </span>
      </label>
      <input
        accept="image/*"
        aria-label={props.label}
        class="sr-only"
        id={inputId}
        onChange={(event) => {
          props.onChange?.(event.currentTarget.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
        type="file"
      />
    </span>
  );
}
