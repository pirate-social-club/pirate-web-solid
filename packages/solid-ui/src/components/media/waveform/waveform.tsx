import { createMemo, For } from "solid-js";

import { cn } from "@/lib/cn";

export interface WaveformProps {
  peaks?: readonly number[];
  seed: string;
  count?: number;
  progressFraction?: number;
  height?: number;
  barWidth?: number;
  gap?: number;
  class?: string;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextState(current: number): number {
  let state = current || 0x9e3779b9;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}

function seededPeaks(seed: string, count: number): number[] {
  const peaks: number[] = [];
  let state = hashSeed(seed);

  for (let index = 0; index < count; index += 1) {
    state = nextState(state + index);
    const random = state / 0xffffffff;
    const wave = 0.5 + Math.sin(index * 0.72) * 0.18;
    peaks.push(Math.max(0.16, Math.min(1, (random * 0.55) + wave * 0.45)));
  }

  return peaks;
}

function normalizePeak(value: number): number {
  if (!Number.isFinite(value)) return 0.2;
  return Math.max(0.08, Math.min(1, value));
}

export function Waveform(props: WaveformProps) {
  const count = () => props.count ?? 72;
  const resolvedPeaks = createMemo(() => {
    if (props.peaks?.length) {
      return props.peaks.slice(0, count()).map(normalizePeak);
    }
    return seededPeaks(props.seed, count());
  });
  const playedCount = createMemo(() =>
    Math.max(
      0,
      Math.min(resolvedPeaks().length, Math.round(resolvedPeaks().length * (props.progressFraction ?? 0))),
    ),
  );
  const className = createMemo(() => cn("grid w-full items-center overflow-hidden", props.class));
  const gridStyle = createMemo(() => ({
    gap: `${props.gap ?? 2}px`,
    "grid-template-columns": `repeat(${resolvedPeaks().length}, minmax(1px, 1fr))`,
    height: `${props.height ?? 24}px`,
  }));

  return (
    <div aria-hidden="true" class={className()} style={gridStyle()}>
      <For each={resolvedPeaks()}>
        {(peak, index) => (
          <span
            class={cn(
              "w-full justify-self-center rounded-full bg-current",
              index() < playedCount() ? "text-primary" : "text-muted-foreground/30",
            )}
            style={{
              height: `${Math.max(2, Math.round(peak * (props.height ?? 24)))}px`,
              "max-width": `${props.barWidth ?? 2}px`,
            }}
          />
        )}
      </For>
    </div>
  );
}
