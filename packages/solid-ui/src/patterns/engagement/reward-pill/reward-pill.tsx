import { createMemo } from "solid-js";

import { IconGift } from "@/components/media/icons";
import { cn } from "@/lib/cn";

export interface RewardPillProps {
  /**
   * How many activities the song offers. It is not money, not a count of
   * rewards, and never says the viewer has earned anything.
   */
  activityCount: number;
  disabled?: boolean;
  onOpen?: () => void;
  class?: string;
}

/**
 * The third engagement pill on a song or video post, beside VotePill and
 * CommentPill: a gift mark and a number, opening the song's rewards sheet.
 * Stateless by design. A post with no song has no pill; leave it out rather
 * than greying it. Loading and unavailable looks are not designed yet.
 */
export function RewardPill(props: RewardPillProps) {
  const className = createMemo(() =>
    cn(
      "inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-border-soft bg-background px-4 text-base transition-colors hover:border-border hover:bg-muted/60",
      props.class,
    ),
  );
  const label = () => `Rewards (${props.activityCount} ${props.activityCount === 1 ? "activity" : "activities"})`;

  return (
    <button
      aria-label={label()}
      class={className()}
      disabled={props.disabled}
      onClick={props.onOpen}
      type="button"
    >
      <IconGift class="size-[23px] text-warning" />
      <span class="font-semibold tabular-nums text-foreground">{props.activityCount}</span>
    </button>
  );
}
