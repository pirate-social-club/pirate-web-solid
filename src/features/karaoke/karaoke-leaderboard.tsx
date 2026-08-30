import { For, Show } from "solid-js";
import {
  Avatar,
  IconButton,
  IconCaretLeft,
  Type,
} from "../../design-system";
import type { ApiKaraokeLeaderboard } from "./karaoke-api";

export interface KaraokeLeaderboardProps {
  title: string;
  artistName?: string;
  artworkSrc?: string;
  leaderboard: ApiKaraokeLeaderboard;
  onExit?: () => void;
  onSing?: () => void;
}

function displayName(entry: ApiKaraokeLeaderboard["entries"][number]): string {
  if (entry.identity.visibility === "anonymized") return "Former member";
  return entry.identity.handle ?? entry.identity.display_name ?? "Anonymous singer";
}

function scoreLabel(score: number): string {
  return `${Math.round(score / 100)}%`;
}

export function KaraokeLeaderboard(props: KaraokeLeaderboardProps) {
  return (
    <main class="min-h-dvh bg-background text-foreground">
      <header class={`border-b border-border-soft ${props.artworkSrc ? "" : "min-h-[130px]"}`}>
        <div class="flex h-14 items-center gap-3 px-4">
          <IconButton aria-label="Back to karaoke" class="size-10 bg-secondary" onClick={props.onExit} variant="secondary">
            <IconCaretLeft class="size-5" />
          </IconButton>
          <Type as="h1" variant="h3">Leaderboard</Type>
        </div>
        <Show when={props.artworkSrc}>
          <div class="flex items-center gap-3 px-5 pb-3.5 pt-2">
            <img alt="" aria-hidden="true" class="size-12 shrink-0 rounded-lg object-cover" src={props.artworkSrc} />
            <div class="min-w-0">
              <Type as="h2" class="truncate" variant="h4">{props.title}</Type>
              <Type as="p" class="truncate text-muted-foreground" variant="body">{props.artistName ?? "Karaoke scores"}</Type>
            </div>
          </div>
        </Show>
      </header>

      <Show
        when={props.leaderboard.entries.length > 0}
        fallback={<Type as="p" class="px-5 pt-6 text-center text-muted-foreground" variant="body">Sing this song to claim the first score.</Type>}
      >
        <ol aria-label="Karaoke leaderboard">
          <For each={props.leaderboard.entries}>
            {(entry) => {
              const name = displayName(entry);
              return (
                <li class={`flex h-[58px] items-center gap-3 border-b border-border-soft px-5 ${entry.is_viewer ? "border-l-4 border-l-primary bg-primary/10 pl-4" : ""}`}>
                  <span class="w-6 shrink-0 text-sm tabular-nums text-muted-foreground">#{entry.rank}</span>
                  <Avatar class="size-8 text-sm" fallback={name} fallbackSeed={entry.identity.handle ?? String(entry.rank)} size="sm" src={entry.identity.visibility === "visible" ? entry.identity.avatar_ref ?? undefined : undefined} />
                  <span class="min-w-0 flex-1 truncate text-sm font-semibold">
                    {name}
                    <Show when={entry.is_viewer}><span class="ms-2 text-xs font-semibold text-primary-text">You</span></Show>
                  </span>
                  <span class="text-sm font-semibold tabular-nums text-foreground">{scoreLabel(entry.score)}</span>
                </li>
              );
            }}
          </For>
        </ol>
      </Show>
    </main>
  );
}
