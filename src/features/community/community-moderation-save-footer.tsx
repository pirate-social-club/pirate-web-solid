import type { JSX } from "@solidjs/web";
import { getLocaleMessages } from "../../locales";
import { useUiLocale } from "../../lib/ui-locale";
import { Button, cn } from "@pirate/web-solid-ui";

export interface CommunityModerationSaveFooterProps {
  class?: string;
  disabled?: boolean;
  loading?: boolean;
  onSave?: () => void;
  primaryLabel?: string;
  secondaryAction?: JSX.Element;
}

/** A host-controlled, sticky save action for the moderation editors. */
export function CommunityModerationSaveFooter(props: CommunityModerationSaveFooterProps) {
  const locale = () => useUiLocale();
  const label = () => props.primaryLabel ?? getLocaleMessages(locale(), "routes").moderation.saveFooter.defaultSaveLabel;

  return (
    <div
      class={cn(
        "community-moderation-save-footer sticky bottom-0 z-20 mt-auto border-t border-border-soft bg-background/95 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-4 backdrop-blur-xl",
        props.class,
      )}
    >
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-h-12">{props.secondaryAction}</div>
        <Button
          class="w-full sm:w-auto"
          disabled={props.disabled}
          loading={props.loading}
          onClick={props.onSave}
        >
          {label()}
        </Button>
      </div>
    </div>
  );
}
