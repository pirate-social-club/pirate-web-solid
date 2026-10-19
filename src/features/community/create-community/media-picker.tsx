/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { Show, createMemo, onCleanup } from "solid-js";
import { Button, IconButton, IconCamera, cn } from "../../../design-system";

/** File ownership stays with the flow, so page navigation preserves the preview. */
export function MediaPicker(props: {
  file?: Blob;
  size?: 72 | 96;
  disabled?: boolean;
  label: string;
  fallback?: JSX.Element;
  chooseLabel: string;
  replaceLabel: string;
  removeLabel: string;
  accept?: string;
  onSelect: (file: File | null) => void;
}) {
  let input: HTMLInputElement | undefined;
  const chosen = createMemo(() => {
    const file = props.file;
    if (!file) return null;
    const url = URL.createObjectURL(file);
    onCleanup(() => URL.revokeObjectURL(url));
    return url;
  });

  return (
    <div class="flex flex-col items-start gap-2">
      <Show when={!props.disabled}>
        <input
          ref={input}
          aria-label={props.label}
          accept={props.accept ?? "image/*"}
          class="hidden"
          onChange={event => {
            props.onSelect(event.currentTarget.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
          type="file"
        />
      </Show>
      <div class={cn("relative", props.size === 72 ? "size-19" : "size-24")}>
        <div
          class={cn("flex items-center justify-center overflow-hidden rounded-full border border-border-soft bg-card", props.size === 72 ? "size-18 border-0" : "size-24")}
          aria-label={props.label}
          role="img"
        >
          <Show when={chosen()} fallback={props.fallback}>
            {url => <img alt="" class="size-full object-cover" src={url()} />}
          </Show>
        </div>
        <Show when={!props.disabled}>
          <IconButton
            aria-label={chosen() ? props.replaceLabel : props.chooseLabel}
            class="absolute bottom-0 right-0 size-8 border-2 border-background bg-secondary"
            onClick={() => input?.click()}
            type="button"
            variant="ghost"
          ><IconCamera class="size-4" /></IconButton>
        </Show>
      </div>
      <Show when={chosen() && !props.disabled}>
        <Button size="sm" type="button" variant="ghost" onClick={() => props.onSelect(null)}>{props.removeLabel}</Button>
      </Show>
    </div>
  );
}
