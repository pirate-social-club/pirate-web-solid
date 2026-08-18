import { For, Show } from "solid-js";
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
    <main class="min-h-dvh bg-background px-4 py-4 text-foreground sm:px-6 sm:py-8">
      <div class="mx-auto w-full max-w-2xl">
        <header class="mb-6 flex items-center gap-3">
          <Button aria-label="Back to karaoke" leadingIcon={<IconCaretLeft class="size-5" />} onClick={props.onExit} size="icon" variant="ghost" />
          <Show when={props.artworkSrc}>
            <img alt="" aria-hidden="true" class="size-12 rounded-lg object-cover" src={props.artworkSrc} />
          </Show>
          <div class="min-w-0 flex-1">
            <Type as="h1" class="truncate" variant="h2">{props.title}</Type>
            <Type as="p" class="truncate text-muted-foreground" variant="body">{props.artistName ?? "Karaoke scores"}</Type>
          </div>
          <Show when={props.onSing}>
            <Button onClick={props.onSing} size="sm">Sing</Button>
          </Show>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Leaderboard</CardTitle>
            <Type as="p" class="text-muted-foreground" variant="caption">
              {props.leaderboard.total_ranked === 0 ? "No eligible scores yet" : `${props.leaderboard.total_ranked} ranked singer${props.leaderboard.total_ranked === 1 ? "" : "s"}`}
            </Type>
          </CardHeader>
          <CardContent>
            <Show
              when={props.leaderboard.entries.length > 0}
              fallback={<Type as="p" class="py-8 text-center text-muted-foreground" variant="body">Sing this song to claim the first score.</Type>}
            >
              <ol class="space-y-2" aria-label="Karaoke leaderboard">
                <For each={props.leaderboard.entries}>
                  {(entry) => {
                    const name = displayName(entry);
                    return (
                      <li class={`flex items-center gap-3 rounded-lg border px-3 py-3 ${entry.is_viewer ? "border-primary/40 bg-primary/10" : "border-border-soft"}`}>
                        <span class="w-8 text-center font-semibold tabular-nums text-muted-foreground">{entry.rank}</span>
                        <Avatar fallback={name} fallbackSeed={entry.identity.handle ?? String(entry.rank)} size="sm" src={entry.identity.visibility === "visible" ? entry.identity.avatar_ref ?? undefined : undefined} />
                        <span class="min-w-0 flex-1 truncate">{name}{entry.is_viewer ? " · you" : ""}</span>
                        <span class="font-semibold tabular-nums text-primary">{scoreLabel(entry.score)}</span>
                      </li>
                    );
                  }}
                </For>
              </ol>
            </Show>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
