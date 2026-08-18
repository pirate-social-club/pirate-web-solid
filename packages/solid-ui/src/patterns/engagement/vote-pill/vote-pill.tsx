import { createMemo, createSignal, Show, untrack } from "solid-js";

import { IconArrowDown, IconArrowUp } from "@/components/media/icons";
import { Spinner } from "@/components/feedback/spinner/spinner";
import { cn } from "@/lib/cn";

function formatScore(score: number): string {
  if (score >= 1000) {
    return `${(score / 1000).toFixed(1)}k`;
  }
  return score.toString();
}

export interface VotePillProps {
  score: number;
  viewerVote?: "up" | "down" | null;
  onVote?: (direction: "up" | "down" | null) => Promise<void> | void;
  allowClear?: boolean;
  busy?: boolean;
  class?: string;
  downvoteLabel?: string;
  size?: "default" | "compact";
  upvoteLabel?: string;
  variant?: "pill" | "bare";
}

export function VotePill(props: VotePillProps) {
  const pendingRef = { current: false };
  const [pendingDirection, setPendingDirection] = createSignal<"up" | "down" | null>(null);

  const handleVote = (direction: "up" | "down") => {
    untrack(() => {
      if (!props.onVote || props.busy || pendingRef.current) return;
      if (props.viewerVote === direction && !props.allowClear) return;

      const nextVote = props.viewerVote === direction && props.allowClear ? null : direction;

      pendingRef.current = true;
      setPendingDirection(direction);

      const finish = () => {
        pendingRef.current = false;
        setPendingDirection(null);
      };

      try {
        const result = props.onVote!(nextVote);
        if (result && typeof result.then === "function") {
          result.then(finish, finish);
        } else {
          finish();
        }
      } catch {
        finish();
      }
    });
  };

  const className = createMemo(() =>
    cn(
      "inline-grid items-center gap-0 transition-colors",
      (props.size ?? "default") === "default" && "h-11 grid-cols-[2.5rem_2rem_2.5rem] px-1",
      (props.size ?? "default") === "compact" && "h-9 grid-cols-[2rem_1.75rem_2rem] px-0.5",
      (props.variant ?? "pill") === "pill" && [
        "rounded-full border border-border-soft bg-background",
        props.viewerVote === "up" && "border-primary/18 bg-primary/6",
        props.viewerVote === "down" && "border-destructive/18 bg-destructive/6",
      ],
      props.class,
    ),
  );

  const controlsBusy = createMemo(() => props.busy || pendingDirection() != null);

  return (
    <div aria-busy={controlsBusy() ? "true" : undefined} class={className()} dir="ltr">
      <button
        aria-label={props.upvoteLabel ?? "Upvote"}
        aria-pressed={props.viewerVote === "up" ? "true" : "false"}
        class={cn(
          "inline-flex items-center justify-center justify-self-center rounded-full transition-colors",
          (props.size ?? "default") === "default" ? "size-10" : "size-8",
          props.viewerVote === "up"
            ? "text-primary-text hover:bg-primary/10"
            : "text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground",
        )}
        disabled={controlsBusy() || (props.viewerVote === "up" && !props.allowClear)}
        onClick={() => handleVote("up")}
        type="button"
      >
        <Show
          when={pendingDirection() !== "up"}
          fallback={<Spinner class={(props.size ?? "default") === "default" ? "size-5" : "size-4"} decorative />}
        >
          <IconArrowUp class={(props.size ?? "default") === "default" ? "size-[23px]" : "size-[20px]"} />
        </Show>
      </button>

      <span
        class={cn(
          "text-center text-base font-semibold tabular-nums",
          (props.size ?? "default") === "default" ? "w-8" : "w-7",
          props.viewerVote === "up" && "text-primary-text",
          props.viewerVote === "down" && "text-destructive-text",
          !props.viewerVote && "text-muted-foreground",
        )}
      >
        {formatScore(props.score)}
      </span>

      <button
        aria-label={props.downvoteLabel ?? "Downvote"}
        aria-pressed={props.viewerVote === "down" ? "true" : "false"}
        class={cn(
          "inline-flex items-center justify-center justify-self-center rounded-full transition-colors",
          (props.size ?? "default") === "default" ? "size-10" : "size-8",
          props.viewerVote === "down"
            ? "text-destructive-text hover:bg-destructive/10"
            : "text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground",
        )}
        disabled={controlsBusy() || (props.viewerVote === "down" && !props.allowClear)}
        onClick={() => handleVote("down")}
        type="button"
      >
        <Show
          when={pendingDirection() !== "down"}
          fallback={<Spinner class={(props.size ?? "default") === "default" ? "size-5" : "size-4"} decorative />}
        >
          <IconArrowDown class={(props.size ?? "default") === "default" ? "size-[23px]" : "size-[20px]"} />
        </Show>
      </button>
    </div>
  );
}
