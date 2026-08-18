import { Button, IconCaretLeft, Type } from "../../design-system";

export interface ActivityProgressHeaderProps {
  progressMax: number;
  progressValue: number;
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
    <header class="grid min-h-14 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b border-border-soft px-4 py-2 sm:min-h-20 sm:px-6 sm:py-3">
      <Button
        aria-label={props.exitLabel ?? "Exit activity"}
        class="size-10 px-0 sm:size-11"
        leadingIcon={<IconCaretLeft class="size-5" />}
        onClick={props.onExit}
        size="icon"
        variant="ghost"
      />
      <div class="flex min-w-0 items-center">
        <div class="flex h-7 min-w-0 flex-1 items-center rounded-full bg-muted pl-1">
          <div
            aria-label="Activity progress"
            aria-valuemax={props.progressMax}
            aria-valuemin="0"
            aria-valuenow={value()}
            class="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-background"
            role="progressbar"
          >
            <div
              class="h-full rounded-full bg-success transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: `${progressPercent()}%` }}
            />
          </div>
          {props.rewardLabel ? (
            <div class="shrink-0 px-2.5 text-warning">
              <Type as="span" class="font-semibold text-current" variant="caption">
                {props.rewardLabel}
              </Type>
            </div>
          ) : <span class="pr-1" />}
        </div>
      </div>
    </header>
  );
}
