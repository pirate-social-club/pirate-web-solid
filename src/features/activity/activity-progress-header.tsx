import { Show } from "solid-js";

import { IconButton, IconCaretLeft, IconGift } from "../../design-system";

export interface ActivityProgressHeaderProps {
  progressMax: number;
  progressValue: number;
  /** Reward value for this activity. Shown as the gift mark's accessible name. */
  rewardLabel?: string;
  onExit?: () => void;
  exitLabel?: string;
}

function clampProgress(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(max, value));
}

export function ActivityProgressHeader(props: ActivityProgressHeaderProps) {
  const value = () => clampProgress(props.progressValue, props.progressMax);
  const progressPercent = () => props.progressMax > 0 ? (value() / props.progressMax) * 100 : 0;

  return (
    <header class="grid min-h-14 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b border-border-soft px-4 py-2 sm:px-6">
      <IconButton
        aria-label={props.exitLabel ?? "Exit activity"}
        class="size-10 bg-secondary"
        onClick={props.onExit}
        variant="secondary"
      >
        <IconCaretLeft class="size-5" />
      </IconButton>
      <div class="flex h-7 min-w-0 items-center gap-2.5">
        <div
          aria-label="Activity progress"
          aria-valuemax={props.progressMax}
          aria-valuemin="0"
          aria-valuenow={value()}
          class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
        >
          <div
            class="h-full rounded-full bg-success transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${progressPercent()}%` }}
          />
        </div>
        <Show when={props.rewardLabel}>
          {(rewardLabel) => (
            <span class="shrink-0 pe-0.5 ps-1 text-warning">
              <IconGift aria-hidden="false" aria-label={rewardLabel()} class="size-[18px]" role="img" />
            </span>
          )}
        </Show>
      </div>
    </header>
  );
}
