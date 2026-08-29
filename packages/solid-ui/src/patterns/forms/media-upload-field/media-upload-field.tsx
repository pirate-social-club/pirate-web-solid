import { createMemo, createUniqueId, Show } from "solid-js";

import { Type } from "@/components/data-display/type/type";
import { IconImage, IconX } from "@/components/media/icons";
import { cn } from "@/lib/cn";
import { FormFieldLabel } from "@/patterns/forms/form-layout/form-layout";

export type MediaUploadFrame = "banner" | "square" | "circle";

export interface MediaUploadFieldProps {
  /** Accessible name for the picker; also the visible field label unless hideLabel. */
  label: string;
  accept?: string;
  class?: string;
  /** Copy on the trigger when nothing is selected yet. */
  chooseLabel?: string;
  /** Copy on the trigger once a preview exists. */
  replaceLabel?: string;
  clearLabel?: string;
  description?: string;
  /** Initials or short text behind an empty circle preview. */
  fallbackLabel?: string;
  hideLabel?: boolean;
  onChange?: (file: File | null) => void;
  onClear?: () => void;
  previewSrc?: string | null;
  frame?: MediaUploadFrame;
}

const previewFrameClass: Record<MediaUploadFrame, string> = {
  banner: "aspect-[4/1] w-full rounded-[var(--radius-lg)]",
  square: "size-24 rounded-[var(--radius-lg)]",
  circle: "size-[4.5rem] rounded-full",
};

/**
 * MediaUploadField - the shared image picker: a labelled file input rendered as
 * a preview surface plus a trigger, with optional clear. The banner and square
 * frames make the whole preview the picker; circle pairs a round preview with a
 * separate trigger, which is the avatar case. Every instance gets its own
 * generated input id, so two fields can coexist on one page.
 */
export function MediaUploadField(props: MediaUploadFieldProps) {
  const inputId = `media-upload-${createUniqueId()}`;
  const frame = () => props.frame ?? "banner";
  const isCircle = () => frame() === "circle";
  const triggerLabel = () =>
    props.previewSrc
      ? (props.replaceLabel ?? props.chooseLabel ?? props.label)
      : (props.chooseLabel ?? props.label);

  const input = (
    <input
      accept={props.accept ?? "image/*"}
      aria-label={props.label}
      class="sr-only"
      id={inputId}
      onChange={(event) => {
        props.onChange?.(event.currentTarget.files?.[0] ?? null);
        event.currentTarget.value = "";
      }}
      type="file"
    />
  );

  const preview = createMemo(() => (
    <span
      class={cn(
        "flex shrink-0 items-center justify-center gap-2 overflow-hidden border border-border-soft bg-card text-muted-foreground",
        previewFrameClass[frame()],
        !isCircle() && "flex-col transition-colors",
      )}
    >
      <Show
        when={props.previewSrc}
        fallback={
          <Show
            when={isCircle() && props.fallbackLabel}
            fallback={
              <>
                <IconImage class="size-5" />
                <Show when={!isCircle()}>
                  <Type as="span" variant="caption">
                    {props.chooseLabel ?? props.label}
                  </Type>
                </Show>
              </>
            }
          >
            <Type as="span" class="text-lg text-foreground" variant="body-strong">
              {props.fallbackLabel}
            </Type>
          </Show>
        }
      >
        {(src) => <img alt="" class="size-full object-cover" src={src()} />}
      </Show>
    </span>
  ));

  const trigger = (
    <label
      class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-lg)] border border-border-soft px-4 text-base font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
      for={inputId}
    >
      <IconImage class="size-4" />
      {triggerLabel()}
    </label>
  );

  return (
    <div class={cn("flex flex-col gap-2", props.class)}>
      <Show when={!props.hideLabel}>
        <FormFieldLabel htmlFor={inputId} label={props.label} />
      </Show>
      {input}
      <Show
        when={isCircle()}
        fallback={
          <div class="relative">
            <label
              class="block cursor-pointer transition-colors hover:[&>span]:border-primary/40 hover:[&>span]:text-foreground"
              for={inputId}
            >
              {preview()}
            </label>
            <Show when={props.previewSrc && props.onClear}>
              <button
                aria-label={props.clearLabel ?? `Remove ${props.label}`}
                class="absolute end-2 top-2 grid size-8 place-items-center rounded-full border border-border-soft bg-background text-foreground transition-colors hover:border-primary/40"
                onClick={() => props.onClear?.()}
                type="button"
              >
                <IconX class="size-4" />
              </button>
            </Show>
          </div>
        }
      >
        <div class="flex items-center gap-3">
          {preview()}
          {trigger}
          <Show when={props.previewSrc && props.onClear}>
            <button
              aria-label={props.clearLabel ?? `Remove ${props.label}`}
              class="grid size-10 place-items-center rounded-full border border-border-soft text-foreground transition-colors hover:border-primary/40"
              onClick={() => props.onClear?.()}
              type="button"
            >
              <IconX class="size-4" />
            </button>
          </Show>
        </div>
      </Show>
      <Show when={props.description}>
        {(description) => (
          <Type as="p" variant="caption">
            {description()}
          </Type>
        )}
      </Show>
    </div>
  );
}
