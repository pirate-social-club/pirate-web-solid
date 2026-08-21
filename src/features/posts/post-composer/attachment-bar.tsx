// Attachment toolbars (mobile fixed bar + desktop button row), ported from
// the React post-composer-attachment-bar.tsx. Icons are mapped from the pure
// `AttachmentActionIcon` markers in defaults.ts.

import { For, Show } from "solid-js";
import { Portal } from "@solidjs/web";

import {
  Button,
  IconBroadcast,
  IconCalendarBlank,
  IconFileText,
  IconImage,
  IconLink,
  IconMusicNote,
  IconPlus,
  IconVideoCamera,
} from "../../../design-system";
import { cn } from "../../../design-system";
import type { AttachmentAction, AttachmentActionIcon } from "./defaults";
import type { ComposerToolbarAction } from "./types";

function AttachmentActionIconGlyph(props: { icon: AttachmentActionIcon }) {
  const className = "size-6";
  switch (props.icon) {
    case "file":
      return <IconFileText class={className} />;
    case "event":
      return <IconCalendarBlank class={className} />;
    case "image":
      return <IconImage class={className} />;
    case "link":
      return <IconLink class={className} />;
    case "live":
      return <IconBroadcast class={className} />;
    case "song":
      return <IconMusicNote class={className} />;
    case "video":
      return <IconVideoCamera class={className} />;
  }
}

export function PostComposerMobileAttachmentBar(props: {
  actions: AttachmentAction[];
  activeKind: ComposerToolbarAction | null;
  onMore?: () => void;
  onSelect: (kind: ComposerToolbarAction) => void;
  bottomOffset?: number;
}) {
  const Bar = () => (
    <div
      class="fixed inset-x-0 z-30 border-t border-border-soft bg-background/95 px-5 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
      style={{ bottom: `${props.bottomOffset ?? 0}px` }}
    >
      <div class="flex items-center justify-between py-3">
        <For each={props.actions}>
          {(action) => (
            <button
              aria-label={action.ariaLabel ?? action.label}
              class={cn(
                "grid size-11 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                props.activeKind === action.kind && "bg-muted text-foreground",
              )}
              onClick={() => props.onSelect(action.kind)}
              type="button"
            >
              <AttachmentActionIconGlyph icon={action.icon} />
            </button>
          )}
        </For>
        <Show when={props.onMore}>
          <button
            aria-label="More post attachments"
            class="grid size-11 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => props.onMore?.()}
            type="button"
          >
            <IconPlus class="size-6" />
          </button>
        </Show>
      </div>
    </div>
  );

  if (typeof document === "undefined") return <Bar />;

  return <Portal><Bar /></Portal>;
}

export function PostComposerDesktopAttachmentToolbar(props: {
  actions: AttachmentAction[];
  activeKind: ComposerToolbarAction | null;
  onSelect: (kind: ComposerToolbarAction) => void;
}) {
  return (
    <div class="flex flex-wrap items-center gap-2">
      <For each={props.actions}>
        {(action) => (
          <Button
            leadingIcon={<AttachmentActionIconGlyph icon={action.icon} />}
            onClick={() => props.onSelect(action.kind)}
            size="sm"
            variant={props.activeKind === action.kind ? "default" : "outline"}
          >
            {action.label}
          </Button>
        )}
      </For>
    </div>
  );
}
