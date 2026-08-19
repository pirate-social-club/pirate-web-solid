/** @jsxImportSource @solidjs/web */
import { For, Show, createMemo, createSignal } from "solid-js";

import { Button, Card, CardContent, CommunityAvatar, Separator, Type } from "@pirate/web-solid-ui";
import {
  gateSummary,
  orderedCommunityRules,
  orderedReferenceLinks,
  safeCommunityHref,
  sortCommunityPosts,
  type CommunityData,
  type CommunitySort,
} from "./page-shell-model";

export interface CommunityPageShellProps {
  community: CommunityData;
  empty?: boolean;
  mobile?: boolean;
  following: boolean;
  joined: boolean;
  onFollowToggle?: () => void;
  onJoin?: () => void;
  canJoin?: boolean;
  showCreatePost?: boolean;
}

export function CommunityPageShell(props: CommunityPageShellProps) {
  const [sort, setSort] = createSignal("Best");
  const [tab, setTab] = createSignal<"feed" | "about">("feed");
  const community = () => props.community;
  const sortedPosts = createMemo(() => {
    const requestedSort = sort().toLowerCase();
    // SAFETY: only the three controlled select values reach this branch; unknown values use the stable best default.
    const communitySort: CommunitySort = requestedSort === "new" ? "new" : requestedSort === "top" ? "top" : "best";
    return sortCommunityPosts(community().posts, communitySort);
  });

  return (
    <div class={props.mobile ? "w-full bg-background" : "mx-auto w-full max-w-6xl bg-background"} data-community-page>
      <header class="flex flex-col gap-4 border-b border-border-soft p-5 md:p-8">
        <div class="flex items-start gap-4">
          <CommunityAvatar communityId={community().handle} displayName={community().name} size="lg" />
          <div class="min-w-0 flex-1">
            <Type variant="h1">{community().name}</Type>
            <Type variant="caption">{community().handle} · {community().followers.toLocaleString("en-US")} followers</Type>
            <Type class="mt-2 block" variant="body">{community().description}</Type>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-3" aria-label="Community actions">
          <Button onClick={() => props.onFollowToggle?.()} variant={props.following ? "secondary" : "default"}>{props.following ? "Following" : "Follow"}</Button>
          <Show when={props.canJoin !== false}>
            <Button disabled={props.joined} onClick={() => props.onJoin?.()} variant="secondary">{props.joined ? "Joined" : "Join"}</Button>
          </Show>
          <Show when={props.joined || props.showCreatePost}><Button>Create</Button></Show>
        </div>
        <div class="flex items-center gap-4 border-t border-border-soft pt-3 md:hidden">
          <button class={tab() === "feed" ? "text-foreground underline underline-offset-4" : "text-muted-foreground"} onClick={() => setTab("feed")} type="button"><Type as="span" variant="label">Feed</Type></button>
          <button class={tab() === "about" ? "text-foreground underline underline-offset-4" : "text-muted-foreground"} onClick={() => setTab("about")} type="button"><Type as="span" variant="label">About</Type></button>
        </div>
      </header>

      <div class="grid gap-6 p-4 md:grid-cols-[minmax(0,1fr)_20rem] md:p-8">
        <main class={tab() === "about" ? "hidden md:block" : "flex flex-col gap-4"} aria-label="Community feed">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <Type variant="h2">Feed</Type>
            <label class="flex items-center gap-2">
              <Type as="span" variant="label">Sort</Type>
              <select aria-label="Sort community feed" onChange={(event) => setSort(event.currentTarget.value)} value={sort()}>
                <option value="Best">Best</option><option value="New">New</option><option value="Top">Top</option>
              </select>
            </label>
          </div>
          <Show when={sortedPosts().length > 0} fallback={<Card><CardContent class="p-6"><Type variant="body">No posts in this community yet.</Type></CardContent></Card>}>
            <For each={sortedPosts()}>
              {(post, index) => <Card><CardContent class="flex flex-col gap-2 p-5"><Type variant="label">{sort()} · Post {index() + 1} · {post.score} points</Type><Type variant="h3">{post.title}</Type><Type variant="body">{post.body}</Type></CardContent></Card>}
            </For>
          </Show>
        </main>

        <aside class={tab() === "about" ? "flex flex-col gap-4" : "flex flex-col gap-4 md:flex"} aria-label="Community information">
          <Card><CardContent class="flex flex-col gap-3 p-5">
            <Type variant="h3">About {community().name}</Type>
            <Type variant="body">{community().description}</Type>
            <Separator />
            <Type variant="caption">{community().members.toLocaleString("en-US")} members · {community().followers.toLocaleString("en-US")} followers</Type>
            <Show when={community().gates}>
              <Type variant="label">{gateSummary(community().gates ?? [], community().gateMode ?? "unknown")}</Type>
              <ul class="flex flex-col gap-2">
                <For each={community().gates}>{(gate) => <li class="flex items-center justify-between gap-3"><Type variant="body">{gate.label}</Type><Type variant="caption">{gate.status}</Type></li>}</For>
              </ul>
            </Show>
            <Show when={community().rules?.length}>
              <Separator />
              <Type variant="label">Community rules</Type>
              <ol class="flex flex-col gap-3">
                <For each={orderedCommunityRules(community().rules ?? [])}>
                  {(rule) => <li><Type variant="body-strong">{rule.title}</Type><Type variant="caption">{rule.body}</Type></li>}
                </For>
              </ol>
            </Show>
            <Show when={community().referenceLinks?.length}>
              <Separator />
              <Type variant="label">Reference links</Type>
              <nav aria-label="Community reference links">
                <ul class="flex flex-col gap-2">
                  <For each={orderedReferenceLinks(community().referenceLinks ?? [])}>
                    {(link) => <Show when={safeCommunityHref(link.href)}>{(href) => <li><a aria-label={`Open ${link.label}`} class="text-foreground underline underline-offset-4" href={href()} rel="noreferrer" target="_blank"><Type as="span" variant="body">{link.label}</Type></a></li>}</Show>}
                  </For>
                </ul>
              </nav>
            </Show>
          </CardContent></Card>
        </aside>
      </div>
    </div>
  );
}
