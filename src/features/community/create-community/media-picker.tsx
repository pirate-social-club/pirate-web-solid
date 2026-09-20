/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { Show, createSignal, createUniqueId, onCleanup } from "solid-js";

import { Button, cn } from "../../../design-system";

/**
 * The legacy MediaPicker shape: a labelled field whose control is a dashed
 * region with a leading image, a prompt or the chosen file's name, a help
 * line, and a Choose file / Replace pill beside a Remove button once a file
 * is set. The chosen file is kept locally for its name and object-URL
 * preview; `fallback` supplies the image shown before anything is chosen
 * (the generated profile default, or initials for the community).
 */
export function MediaPicker(props: {
  /** Visible field label. */
  label: string;
  /** Shown in the region before a file is chosen, e.g. the generated default. */
  fallback?: JSX.Element;
  /** Prompt line in the region before a file is chosen; omitted when empty. */
  prompt?: string;
  /** Help line under the prompt while nothing is chosen; omitted when empty. */
  help?: string;
  chooseLabel: string;
  replaceLabel: string;
  removeLabel: string;
  accept?: string;
  onSelect: (file: File | null) => void;
}) {
  const inputId = `media-picker-${createUniqueId()}`;
  const [chosen, setChosen] = createSignal<{ name: string; url: string } | null>(null);
  onCleanup(() => {
    const current = chosen();
    if (current) URL.revokeObjectURL(current.url);
  });

  return (
    <div class="flex flex-col gap-2">
      <span class="text-base font-medium leading-tight text-foreground">{props.label}</span>
      <input
        accept={props.accept ?? "image/*"}
        class="sr-only"
        id={inputId}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          const previous = chosen();
          if (previous) URL.revokeObjectURL(previous.url);
          setChosen(file ? { name: file.name, url: URL.createObjectURL(file) } : null);
          props.onSelect(file);
          event.currentTarget.value = "";
        }}
        type="file"
      />
      <div class="flex min-h-24 items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-border-soft bg-card p-4">
          <div class="flex min-w-0 items-center gap-4">
            <Show when={chosen()} fallback={props.fallback}>
              {(file) => <img alt="" class="size-10 shrink-0 rounded-[var(--radius-lg)] object-cover" src={file().url} />}
            </Show>
            <Show when={props.prompt || props.help}>
              <div class="min-w-0 space-y-1">
                <Show when={props.prompt}>
                  <p class="truncate text-base font-medium text-foreground">
                    {chosen()?.name ?? props.prompt}
                  </p>
                </Show>
                <Show when={!chosen() && props.help}>
                  <p class="text-base text-muted-foreground">{props.help}</p>
                </Show>
              </div>
            </Show>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Show when={chosen()}>
              <Button onClick={() => {
                const previous = chosen();
                if (previous) URL.revokeObjectURL(previous.url);
                setChosen(null);
                props.onSelect(null);
              }} size="sm" type="button" variant="ghost">
                {props.removeLabel}
              </Button>
            </Show>
            <label class="cursor-pointer" for={inputId}>
              <span class={cn("inline-flex h-10 cursor-pointer items-center rounded-full bg-muted px-4 text-base font-semibold text-foreground")}>
                {chosen() ? props.replaceLabel : props.chooseLabel}
              </span>
            </label>
        </div>
      </div>
    </div>
  );
}
