import { For, Show } from "solid-js";
import type { ActivityProgressData } from "./activity-private-api.ts";

/** Dates, marks and counts are server facts. No calendar arithmetic or browser clock. */
export function ActivityProgress(props: { readonly progress: ActivityProgressData }) {
  return <div class="space-y-3" data-private-activity-progress>
    <dl class="grid grid-cols-2 gap-3 text-sm">
      <div><dt>Current streak</dt><dd>{props.progress.streak.current} days</dd></div>
      <div><dt>Best streak</dt><dd>{props.progress.streak.best} days</dd></div>
      <div><dt>Qualifying days</dt><dd>{props.progress.streak.total_days}</dd></div>
      <div><dt>Rank</dt><dd>{props.progress.standing?.rank ?? "Not currently ranked"}</dd></div>
    </dl>
    <p class="text-sm">All recorded qualifications</p>
    <dl class="grid grid-cols-2 gap-3 text-sm"><For each={props.progress.activity_counts}>{row => <div><dt>{row.activity === "study" ? "Study" : "Karaoke"}</dt><dd>{row.qualification_count}</dd></div>}</For></dl>
    <p class="text-sm">{props.progress.week.start_day} – {props.progress.week.end_day} · {props.progress.timezone}<Show when={!props.progress.timezone_pinned}> (not pinned yet)</Show></p>
    <ol aria-label="Recorded streak week" class="grid grid-cols-7 gap-1 text-center text-xs">
      <For each={props.progress.week.days}>{day => <li class="min-w-0 rounded border border-border-soft p-1" data-streak-day={day.day} data-earned={day.earned ? "true" : "false"}>
        <time datetime={day.day} aria-current={day.day === props.progress.today ? "date" : undefined}>{day.day.slice(5)}</time>
        <span class="block" aria-label={day.earned ? "Earned" : "Not earned"}>{day.earned ? "✓" : "–"}</span>
      </li>}</For>
    </ol>
    <p class="text-xs text-muted-foreground">Observed <time datetime={props.progress.observed_at}>{props.progress.observed_at}</time>. Dates and marks are from the server.</p>
  </div>;
}
