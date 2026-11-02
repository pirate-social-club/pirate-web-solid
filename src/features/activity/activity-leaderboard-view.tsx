import type { JSX } from "@solidjs/web";
import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Avatar, Button, IconArrowLeft, IconFire, IconWarningCircle } from "../../design-system.ts";
import type { ActivityLeaderboardData } from "./activity-api.ts";
import type { ActivityProgressData } from "./activity-private-api.ts";

export type StreakEntry = ActivityLeaderboardData["entries"][number];
export const streakProfileLabel = (entry: StreakEntry) => entry.persona.display_name || entry.persona.primary_public_handle || "Community profile";
export function StreakCount(props: { readonly count: number; readonly class?: string }) {
  return <span class={`inline-flex w-14 shrink-0 items-center justify-end gap-1 font-bold tabular-nums text-warning ${props.class ?? ""}`} aria-label={`${props.count} day streak`}>
    <span>{props.count}</span><IconFire filled class="size-5 shrink-0" />
  </span>;
}
function StandingRow(props: { readonly entry: StreakEntry; readonly small?: boolean; readonly viewer?: boolean }) {
  return <div class={`flex min-w-0 items-center gap-3 ${props.small ? "min-h-11" : "min-h-14 px-3"} ${props.viewer ? "rounded-xl bg-primary-subtle ring-1 ring-primary/30" : ""}`} data-streak-entry={props.entry.persona.persona_id}>
    <span class={`${props.small ? "w-5 text-sm" : "w-7"} shrink-0 text-center font-semibold tabular-nums text-muted-foreground`} aria-label={`Rank ${props.entry.rank}`}>{props.entry.rank}</span>
    <Avatar src={props.entry.persona.avatar_ref ?? undefined} fallback={streakProfileLabel(props.entry)} class={props.small ? "size-7 shrink-0" : "size-9 shrink-0"} />
    <span class="min-w-0 flex-1 truncate font-medium">{props.viewer ? "You" : streakProfileLabel(props.entry)}</span>
    <StreakCount count={props.entry.current} />
  </div>;
}
export interface LeaderboardViewProps {
  readonly state: "loading" | "ready" | "error" | "session-error" | "restricted";
  readonly board?: ActivityLeaderboardData;
  readonly progress?: ActivityProgressData;
  readonly authenticated?: boolean;
  readonly privateState?: "loading" | "ready" | "error";
  readonly onRetry: () => void;
}
function BoardSkeleton(props: { readonly preview?: boolean }) {
  return <div role="status" aria-label="Loading leaderboard" class="space-y-3 py-3" aria-busy="true">
    <span class="sr-only">Loading leaderboard</span>
    <Show when={!props.preview}><div class="h-48 animate-pulse rounded-3xl bg-muted" /></Show>
    <For each={[0, 1, 2]}>{() => <div aria-hidden="true" class="flex h-11 items-center gap-3"><div class="size-8 animate-pulse rounded-full bg-muted" /><div class="h-4 flex-1 animate-pulse rounded bg-muted" /></div>}</For>
  </div>;
}
function BoardFailure(props: { readonly state: LeaderboardViewProps["state"]; readonly retry: () => void }) {
  return <div class="flex min-h-60 flex-col items-center justify-center gap-4 px-5 py-10 text-center" role="alert">
    <IconWarningCircle class="size-12 text-muted-foreground" />
    <h2 class="text-xl font-semibold">The leaderboard isn't showing</h2>
    <p class="text-muted-foreground">{props.state === "restricted" ? "Sign in again or check your access." : props.state === "session-error" ? "We couldn't check your session." : "Try again to load the latest standings."}</p>
    <Button variant="secondary" onClick={props.retry}>Try again</Button>
  </div>;
}
function EmptyBoard() {
  return <div class="flex min-h-64 flex-col items-center justify-center gap-3 px-5 py-10 text-center">
    <IconFire class="size-14 text-muted-foreground" /><h2 class="text-xl font-semibold">No streaks yet</h2>
    <p class="text-muted-foreground">Study or sing here today to be first.</p>
  </div>;
}
export function ActivityLeaderboardCard(props: LeaderboardViewProps & { readonly href: string }) {
  const standing = () => props.authenticated ? props.board?.viewer_standing : undefined;
  return <section aria-label="Leaderboard" class="min-w-0 rounded-3xl border border-border-soft bg-card p-5" data-leaderboard-card data-activity-leaderboard>
    <div class="mb-3 flex items-center justify-between gap-3"><h2 class="text-xl font-semibold">Leaderboard</h2><a href={props.href} class="shrink-0 text-sm font-semibold text-primary-text">See all<span aria-hidden="true"> ›</span></a></div>
    <Show when={props.state !== "loading"} fallback={<BoardSkeleton preview />}>
      <Show when={props.state === "ready"} fallback={<BoardFailure state={props.state} retry={props.onRetry} />}>
        <Show when={standing() && standing()!.current > 0 ? standing() : undefined}>{entry => <div class="mb-2 flex items-center gap-2.5 rounded-xl bg-muted p-3">
          <IconFire filled class="size-7 shrink-0 text-warning" /><div><p class="font-bold text-warning">{entry().current} day streak</p><p class="text-sm text-muted-foreground">Your rank: {entry().rank}</p></div>
        </div>}</Show>
        <Show when={props.board?.entries.length} fallback={<p class="py-3 text-sm text-muted-foreground">No streaks yet</p>}>
          <ol aria-label="Top streaks"><For each={props.board?.entries.slice(0, 3)}>{entry => <li><StandingRow entry={entry} small /></li>}</For></ol>
        </Show>
      </Show>
    </Show>
  </section>;
}
function YourStreak(props: { readonly progress: ActivityProgressData }) {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return <section aria-label="Your streak" class="flex flex-col gap-5 rounded-3xl border border-border-soft bg-card p-5">
    <div class="flex items-end justify-between gap-3"><div class="flex items-center gap-2.5"><IconFire filled class="size-11 text-warning" /><div><p class="text-5xl font-extrabold leading-none tracking-tight text-warning">{props.progress.streak.current}</p><p class="text-sm font-medium">day streak</p></div></div>
      <div class="text-right"><p class="text-3xl font-bold">{props.progress.standing?.rank ?? "—"}</p><p class="text-sm text-muted-foreground">{props.progress.standing ? "your rank" : "not currently ranked"}</p></div></div>
    <ol aria-label="Recorded streak week" class="flex justify-between gap-1"><For each={props.progress.week.days}>{(day, index) => <li class="flex w-6 flex-col items-center gap-1">
      <time datetime={day.day} title={day.day} aria-current={day.day === props.progress.today ? "date" : undefined} class={`grid size-6 place-items-center rounded-full ${day.earned ? "bg-warning font-bold text-background" : "border-2 border-border"}`}><span class="sr-only">{day.day}, {day.earned ? "earned" : "not earned"}</span><span aria-hidden="true">{day.earned ? "✓" : ""}</span></time><span class="text-xs text-muted-foreground">{days[index()]}</span>
    </li>}</For></ol>
    <dl class="grid grid-cols-2 gap-6 border-t border-border-soft pt-4"><div><dd class="text-lg font-bold">{props.progress.streak.best} days</dd><dt class="text-sm text-muted-foreground">Best streak</dt></div><div><dd class="text-lg font-bold">{props.progress.streak.total_days} days</dd><dt class="text-sm text-muted-foreground">In total</dt></div></dl>
  </section>;
}
function Podium(props: { readonly entries: readonly StreakEntry[]; readonly authenticated?: boolean; readonly onViewer?: (element: HTMLElement) => void }) {
  return <ol aria-label="Leading streaks" class="flex items-end gap-2 px-4 pt-7">
    <For each={props.entries.slice(0, 3)}>{(entry, index) => <li ref={element => { if (props.authenticated && entry.is_viewer) props.onViewer?.(element); }} data-streak-entry={entry.persona.persona_id} class={`flex min-w-0 flex-1 flex-col items-center gap-2 ${index() === 0 ? "order-2" : index() === 1 ? "order-1" : "order-3"}`}>
      <Avatar src={entry.persona.avatar_ref ?? undefined} fallback={streakProfileLabel(entry)} class={`shrink-0 border-[3px] ${index() === 0 ? "size-[72px] border-warning" : index() === 1 ? "size-14 border-[#B8C0CC]" : "size-14 border-[#C98A5B]"}`} />
      <div class="flex w-full min-w-0 flex-col items-center"><span class="max-w-full truncate text-sm font-semibold">{props.authenticated && entry.is_viewer ? "You" : streakProfileLabel(entry)}</span><StreakCount count={entry.current} /></div>
      <div class={`w-full rounded-t-2xl pt-3 text-center text-3xl font-extrabold ${index() === 0 ? "h-[100px] bg-warning/20 text-warning" : index() === 1 ? "h-[72px] bg-[#B8C0CC24] text-[#B8C0CC]" : "h-14 bg-[#C98A5B29] text-[#C98A5B]"}`} aria-label={`Rank ${entry.rank}`}>{entry.rank}</div>
    </li>}</For>
  </ol>;
}
export function ActivityLeaderboardPage(props: LeaderboardViewProps & { readonly title: string; readonly backHref: string; readonly controls?: JSX.Element }) {
  const [viewerVisible, setViewerVisible] = createSignal(true);
  const [boardElement, setBoardElement] = createSignal<HTMLElement>();
  // The element effect measures layout once before resize events take over.
  const [boardBounds, setBoardBounds] = createSignal({ left: 0, width: 0 }, { ownedWrite: true });
  createEffect(boardElement, element => {
    if (!element) return;
    const measure = () => { const bounds = element.getBoundingClientRect(); setBoardBounds({ left: bounds.left, width: bounds.width }); };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(element); window.addEventListener("resize", measure);
    onCleanup(() => { observer?.disconnect(); window.removeEventListener("resize", measure); });
  });
  const [viewerElement, setViewerElement] = createSignal<HTMLElement>();
  const own = () => props.authenticated && props.board?.viewer_standing?.current ? props.board.viewer_standing : undefined;
  const ownProgress = () => props.authenticated && props.progress && props.progress.streak.current > 0 ? props.progress : undefined;
  const outside = () => { const ownEntry = own(); return ownEntry && !props.board?.entries.some(entry => entry.persona.persona_id === ownEntry.persona.persona_id); };
  createEffect(viewerElement, element => {
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => setViewerVisible(entries.some(entry => entry.isIntersecting)), { threshold: 0, rootMargin: "-56px 0px -80px 0px" });
    observer.observe(element); onCleanup(() => observer.disconnect());
  });
  const pin = () => props.state === "ready" && own() && !viewerVisible() ? own() : undefined;
  const back = (event: MouseEvent) => {
    // Only return through same-origin history; a direct open has a stable fallback.
    if (typeof document !== "undefined" && document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) { event.preventDefault(); history.back(); }
  };
  return <main class="mx-auto min-w-0 max-w-6xl bg-background pb-24" data-leaderboard-page>
    <header class="flex h-14 items-center justify-between gap-3 px-4"><a href={props.backHref} onClick={back} aria-label="Back" class="grid size-11 shrink-0 place-items-center rounded-lg focus-visible:ring-2"><IconArrowLeft class="size-6" /></a><div class="min-w-0 text-center"><h1 class="text-lg font-semibold">Leaderboard</h1><p class="truncate text-[13px] text-muted-foreground">{props.title}</p></div><span class="size-11 shrink-0" /></header>
    <Show when={props.state !== "loading"} fallback={<div class="mx-auto max-w-2xl px-4"><BoardSkeleton /></div>}>
      <Show when={props.state === "ready"} fallback={<BoardFailure state={props.state} retry={props.onRetry} />}>
        <Show when={props.board?.entries.length} fallback={<EmptyBoard />}>
          <div class={`grid gap-6 px-4 pt-2 md:px-8 md:pt-6 ${ownProgress() ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : "mx-auto max-w-3xl"}`}>
            <Show when={ownProgress()}>{progress => <aside class="min-w-0 lg:col-start-2 lg:row-start-1" data-streak-rail><YourStreak progress={progress()} /></aside>}</Show>
            <section ref={setBoardElement} aria-label="Streak standings" class="min-w-0 lg:col-start-1 lg:row-start-1">
              <Podium entries={props.board?.entries ?? []} authenticated={props.authenticated} onViewer={setViewerElement} />
              <ol start={4} aria-label="More streaks" class="border-t border-border-soft py-2">
                <For each={props.board?.entries.slice(3)}>{entry => <li ref={element => { if (props.authenticated && entry.is_viewer) setViewerElement(element); }}><StandingRow entry={entry} viewer={props.authenticated && entry.is_viewer} /></li>}</For>
                <Show when={outside() ? own() : undefined}>{entry => <li ref={setViewerElement}><StandingRow entry={entry()} viewer /></li>}</Show>
              </ol>
            </section>
          </div>
        </Show>
      </Show>
    </Show>
    <Show when={props.authenticated && props.privateState === "error"}><div class="mx-auto max-w-2xl space-y-2 px-4 py-4"><p role="alert">Your progress is unavailable.</p><Button variant="secondary" onClick={props.onRetry}>Retry progress</Button></div></Show>
    <Show when={props.controls}><div class="mx-auto mt-8 max-w-3xl border-t border-border-soft px-4 pt-6">{props.controls}</div></Show>
    <Show when={pin()}>{entry => <div class="pointer-events-none fixed bottom-4 z-20" style={{ left: `${boardBounds().left}px`, width: `${boardBounds().width}px` }} data-pinned-viewer aria-hidden="true"><div class="mx-auto max-w-2xl rounded-xl bg-background shadow-lg"><StandingRow entry={entry()} viewer /></div></div>}</Show>
  </main>;
}
